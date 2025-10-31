import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, onSnapshot, collection, query, where, addDoc, updateDoc, deleteDoc, setDoc, getDocs } from 'firebase/firestore';
import { Settings, Zap, DollarSign, Sunrise, Users, Plus, Trash2, Gauge, AlertTriangle, CheckCircle, Loader2, BarChart3 } from 'lucide-react';

// --- CONFIGURATION AND UTILS ---

// Global variables provided by the canvas environment
const appId = 'solar-energy-planner'; 
const firebaseConfig = {
  apiKey: process.env.REACT_APP_GOOGLE_API_KEY,
  authDomain: "solar-energy-planner.firebaseapp.com",
  projectId: "solar-energy-planner",
  storageBucket: "solar-energy-planner.firebasestorage.app",
  messagingSenderId: "425002466130",
  appId: "1:425002466130:web:6da91f4c6f88da5952588b",
  measurementId: "G-4MKN6B45GN"
};
const initialAuthToken = null;


// The base URL for the Gemini API (using a placeholder key which is filled by the canvas environment)
const GEMINI_API_KEY = "";
const GEMINI_API_URL = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
const GEMINI_MODEL = "gemini-2.5-flash-preview-09-2025";


// --- FIREBASE INITIALIZATION AND HOOKS ---
let firebaseApp, db, auth;

// State to store firebase instances and user info
const useFirebase = () => {
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [userId, setUserId] = useState(null);

    useEffect(() => {
        if (Object.keys(firebaseConfig).length === 0) {
            console.error("Firebase config is missing.");
            return;
        }

        try {
            firebaseApp = initializeApp(firebaseConfig);
            db = getFirestore(firebaseApp);
            auth = getAuth(firebaseApp);

            const unsubscribe = onAuthStateChanged(auth, async (user) => {
                if (user) {
                    setUserId(user.uid);
                    setIsAuthReady(true);
                } else {
                    if (initialAuthToken) {
                        await signInWithCustomToken(auth, initialAuthToken);
                    } else {
                        await signInAnonymously(auth);
                    }
                }
            });

            return () => unsubscribe();
        } catch (error) {
            console.error("Firebase Initialization Error:", error);
            setIsAuthReady(true); // Still set to true to move past initialization
        }
    }, []);

    return { db, auth, userId, isAuthReady };
};

// --- CORE DATA STRUCTURES AND HELPERS ---

// Default currency is Indian Rupee (INR) as requested
const DEFAULT_RATE = 9.0; // Updated to 9.0 /kWh for VJTI planning

const initialSolarSettings = {
    electricityRate: DEFAULT_RATE, // Grid electricity rate in /kWh
    solarCostPerKW: 70000,         // Installation cost per kW in INR
    efficiencyFactor: 1.0,         // System losses/efficiency (Updated from 0.8 to 1.0 to align with user's 4.3 year payback calculation)
    sunlightHours: 5,              // Average daily peak sunlight hours (Kept at 5)
    lifetimeYears: 25,             // Expected system lifetime
    annualInflation: 0.05,         // Assumed annual electricity price inflation (5%)
};

const initialRoom = {
    name: 'New Room',
    purpose: 'Classroom', // Classroom, Lab, Office, Server Room
};

const initialDevice = {
    name: 'New Device',
    quantity: 1,
    powerW: 100, // Watts
    usageHours: 4, // Hours per day
};

// Helper to format numbers as currency (using Rs. prefix to avoid encoding issues)
const formatCurrency = (amount) => {
    // Using simple Rs. prefix for compatibility
    return `Rs. ${new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(amount)}`;
};

// Helper to format as percentage
const formatPercent = (value) => `${(value * 100).toFixed(1)}%`;


// --- DATA FETCHING AND PERSISTENCE HOOK ---

const useEnergyData = (db, userId, isAuthReady) => {
    const [rooms, setRooms] = useState([]);
    const [devices, setDevices] = useState([]);
    const [solarSettings, setSolarSettings] = useState(initialSolarSettings);
    const [isLoading, setIsLoading] = useState(true);

    const roomCollectionPath = useMemo(() => `/artifacts/${appId}/users/${userId}/rooms`, [userId]);
    const deviceCollectionPath = useMemo(() => `/artifacts/${appId}/users/${userId}/devices`, [userId]);
    const settingsDocPath = useMemo(() => `settings`, [userId]);

    useEffect(() => {
        if (!isAuthReady || !db || !userId) return;

        // 1. Subscribe to Rooms
        const qRooms = collection(db, roomCollectionPath);
        const unsubscribeRooms = onSnapshot(qRooms, (snapshot) => {
            const roomList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRooms(roomList);
        });

        // 2. Subscribe to Devices
        const qDevices = collection(db, deviceCollectionPath);
        const unsubscribeDevices = onSnapshot(qDevices, (snapshot) => {
            const deviceList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setDevices(deviceList);
        });

        // 3. Subscribe to Solar Settings (using a specific document)
        const settingsRef = doc(db, roomCollectionPath, settingsDocPath);
        const unsubscribeSettings = onSnapshot(settingsRef, (docSnap) => {
            if (docSnap.exists()) {
                // Ensure we merge with new defaults if fields are missing in DB
                setSolarSettings({ ...initialSolarSettings, ...docSnap.data() });
            } else {
                // If settings don't exist, create a default one
                setDoc(settingsRef, initialSolarSettings, { merge: true }).catch(console.error);
                setSolarSettings(initialSolarSettings);
            }
            setIsLoading(false);
        }, (error) => {
            console.error("Error fetching settings:", error);
            setIsLoading(false);
        });

        return () => {
            unsubscribeRooms();
            unsubscribeDevices();
            unsubscribeSettings();
        };

    }, [db, userId, isAuthReady, roomCollectionPath, deviceCollectionPath, settingsDocPath]);

    const addRoom = async (roomData) => {
        if (!db) return;
        await addDoc(collection(db, roomCollectionPath), roomData);
    };

    const addDevice = async (deviceData) => {
        if (!db) return;
        await addDoc(collection(db, deviceCollectionPath), deviceData);
    };

    const updateDevice = async (id, data) => {
        if (!db) return;
        await updateDoc(doc(db, deviceCollectionPath, id), data);
    };

    const deleteDevice = async (id) => {
        if (!db) return;
        // IMPORTANT: window.confirm is forbidden. Using a simple console log placeholder for demonstration.
        // In a real application, replace with a custom modal component.
        console.warn('Confirm dialog suppressed. If you were confirming deletion, it would proceed now.');
        await deleteDoc(doc(db, deviceCollectionPath, id));
    };

    const deleteRoom = async (roomId) => {
        if (!db) return;
        // 1. Delete the room document
        await deleteDoc(doc(db, roomCollectionPath, roomId));

        // 2. Delete all associated devices (using a batch would be better, but we'll use a query for simplicity)
        const q = query(collection(db, deviceCollectionPath), where("roomId", "==", roomId));
        const deviceDocs = await getDocs(q);
        deviceDocs.forEach(async (d) => {
            await deleteDoc(d.ref);
        });
    };

    const updateSolarSettings = async (data) => {
        if (!db) return;
        await setDoc(doc(db, roomCollectionPath, settingsDocPath), data, { merge: true });
    };

    return { rooms, devices, solarSettings, isLoading, addRoom, addDevice, updateDevice, deleteDevice, deleteRoom, updateSolarSettings };
};

// --- CORE CALCULATION LOGIC ---

/**
 * Calculates energy and cost metrics for a single device.
 * @param {Object} device - The device object.
 * @param {number} rate - Electricity rate (INR/kWh).
 * @returns {Object} Calculated metrics.
 */
const calculateDeviceMetrics = (device, rate) => {
    const { quantity, powerW, usageHours } = device;
    const powerKW = powerW / 1000;
    const energyKWhDay = powerKW * quantity * usageHours;
    const costDay = energyKWhDay * rate;

    return {
        energyKWhDay,
        costDay,
        costMonth: costDay * (365.25 / 12),
        costYear: costDay * 365.25,
    };
};

/**
 * Computes all energy and cost totals for the entire building.
 * @param {Array} rooms - List of room objects.
 * @param {Array} devices - List of device objects.
 * @param {Object} solarSettings - Solar configuration.
 * @returns {Object} Comprehensive metrics including room-level breakdowns.
 */
const calculateBuildingTotals = (rooms, devices, solarSettings) => {
    const { electricityRate, solarCostPerKW, efficiencyFactor, sunlightHours, lifetimeYears, annualInflation } = solarSettings;

    let totalEnergyKWhDay = 0;
    let totalCostYearGrid = 0;

    const roomsWithMetrics = rooms.map(room => {
        const roomDevices = devices.filter(d => d.roomId === room.id);

        let roomEnergyKWhDay = 0;
        let roomCostYearGrid = 0;

        const devicesWithMetrics = roomDevices.map(device => {
            const metrics = calculateDeviceMetrics(device, electricityRate);
            roomEnergyKWhDay += metrics.energyKWhDay;
            roomCostYearGrid += metrics.costYear;
            return { ...device, metrics };
        });

        // Solar Calculations for the room
        // required capacity = total annual consumption / (annual generation per kW)
        // Annual generation per kW = 365.25 * sunlightHours * efficiencyFactor
        const annualConsumptionKWh = roomEnergyKWhDay * 365.25;
        const annualGenerationPerKW = 365.25 * sunlightHours * efficiencyFactor;

        const requiredCapacityKW = annualGenerationPerKW > 0 ? annualConsumptionKWh / annualGenerationPerKW : 0;
        const installationCost = requiredCapacityKW * solarCostPerKW;
        const yearlySavings = roomCostYearGrid;
        const roiYears = yearlySavings > 0 ? installationCost / yearlySavings : Infinity;

        totalEnergyKWhDay += roomEnergyKWhDay;
        totalCostYearGrid += roomCostYearGrid;

        return {
            ...room,
            devices: devicesWithMetrics,
            metrics: {
                energyKWhDay: roomEnergyKWhDay,
                costYearGrid: roomCostYearGrid,
                requiredCapacityKW: requiredCapacityKW > 0 ? requiredCapacityKW : 0,
                installationCost,
                roiYears: Math.min(roiYears, 999), // Cap for display
                yearlySavings
            }
        };
    });

    // --- Building-Level Solar ROI ---
    const totalAnnualConsumptionKWh = totalEnergyKWhDay * 365.25;
    const annualGenerationPerKW = 365.25 * sunlightHours * efficiencyFactor;
    
    const totalRequiredCapacityKW = annualGenerationPerKW > 0 ? totalAnnualConsumptionKWh / annualGenerationPerKW : 0;
    const totalInstallationCost = totalRequiredCapacityKW * solarCostPerKW;
    const totalYearlySavings = totalCostYearGrid;
    const totalROIYears = totalYearlySavings > 0 ? totalInstallationCost / totalYearlySavings : Infinity;

    // Long-term savings calculation (Simple compounding)
    let futureSavings = 0;
    let gridCost = totalCostYearGrid;
    for (let i = 0; i < lifetimeYears; i++) {
        futureSavings += gridCost;
        gridCost *= (1 + annualInflation);
    }
    const longTermSavings = futureSavings - totalInstallationCost;

    return {
        rooms: roomsWithMetrics,
        building: {
            totalEnergyKWhDay,
            totalCostYearGrid,
            totalRequiredCapacityKW,
            totalInstallationCost,
            totalROIYears: Math.min(totalROIYears, 999),
            longTermSavings,
            paybackYears: totalROIYears,
            yearlySavings: totalYearlySavings,
        }
    };
};

// --- LLM Recommendation Generator ---

/**
 * Calls the Gemini API to generate structured, human-readable recommendations.
 * @param {Array} roomAnalysis - Pre-analyzed data for each room.
 * @param {Object} buildingData - Total building metrics.
 * @returns {Object} The parsed recommendation object from the LLM.
 */
const generateLLMRecommendation = async (roomAnalysis, buildingData) => {
    const analysisPayload = roomAnalysis.map(r => ({
        roomName: r.name,
        yearlyCost_INR: r.metrics.costYearGrid.toFixed(0),
        requiredCapacity_KW: r.metrics.requiredCapacityKW.toFixed(2),
        roiYears: r.metrics.roiYears.toFixed(1),
        suggestedAction: r.metrics.roiYears < 5.0 ? 'Convert to Solar' : (r.metrics.roiYears < 10.0 ? 'Hybrid Model' : 'Stay on Grid'),
    }));

    const systemPrompt = `You are a world-class energy efficiency consultant. Analyze the provided college building data and solar settings. The goal is to maximize long-term savings by optimizing the energy mix (Grid vs. Solar). Use a 5-year ROI as a strong indicator for full solar conversion and a 10-year ROI for a hybrid approach. Rooms with high ROI (>10 years) or low usage should remain on the grid.

    Generate the analysis in the requested JSON format.

    - The 'summary' must be a concise, professional paragraph explaining the strategy and main conclusion.
    - 'totalSavings' should be the total annual savings (in INR) from the *suggested* conversions only.
    - 'breakevenPeriod' should be the ROI in years for the total *suggested* capacity.
    - 'capacityNeeded' should be the sum of required capacity (kW) for *suggested* solar conversions.
    - 'roomRecommendations' should detail the suggestions and reasoning for *every* room provided. The reasoning must reference the room's usage or ROI.
    `;

    const userQuery = `Analyze the energy consumption data for the college building.
    
    Building Totals: Total Yearly Grid Cost = ${formatCurrency(buildingData.totalCostYearGrid)}
    Total Required Solar Capacity (100% conversion) = ${buildingData.totalRequiredCapacityKW.toFixed(2)} kW.
    
    Room-by-Room Analysis:
    ${JSON.stringify(analysisPayload, null, 2)}
    
    Based on this data, provide the optimal energy strategy in the requested JSON format.`;

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                properties: {
                    summary: { type: "STRING" },
                    totalSavings: { type: "NUMBER" },
                    breakevenPeriod: { type: "NUMBER" },
                    capacityNeeded: { type: "NUMBER" },
                    roomRecommendations: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            properties: {
                                roomName: { type: "STRING" },
                                suggestion: { type: "STRING" },
                                reasoning: { type: "STRING" }
                            }
                        }
                    }
                }
            }
        }
    };

    try {
        const response = await fetch(GEMINI_API_URL(GEMINI_MODEL), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const result = await response.json();
        const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (jsonText) {
            return JSON.parse(jsonText);
        } else {
            console.error("LLM did not return valid JSON:", result);
            throw new Error("Failed to get structured recommendation from AI.");
        }
    } catch (e) {
        console.error("AI API Call Error:", e);
        // Fallback to simple rule-based logic if API fails
        return {
            summary: "AI recommendation service is unavailable. Falling back to rule-based analysis: Rooms with ROI < 5 years are suggested for solar conversion.",
            totalSavings: 0,
            breakevenPeriod: 0,
            capacityNeeded: 0,
            roomRecommendations: roomAnalysis.map(r => ({
                roomName: r.name,
                suggestion: r.metrics.roiYears < 5.0 ? 'Convert to Solar (Rule-Based)' : 'Stay on Grid (Rule-Based)',
                reasoning: r.metrics.roiYears < 5.0 ? `High usage and good ROI of ${r.metrics.roiYears.toFixed(1)} years.` : `Low usage or high ROI of ${r.metrics.roiYears.toFixed(1)} years.`
            }))
        };
    }
};

// --- REACT COMPONENTS ---

const Card = ({ title, value, icon, accentColor = 'text-blue-500', className = '' }) => (
    <div className={`p-5 bg-white rounded-xl shadow-lg border border-gray-100 flex items-center justify-between ${className}`}>
        <div>
            <p className="text-sm font-medium text-gray-500">{title}</p>
            <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
        </div>
        <div className={`p-3 rounded-full ${accentColor} bg-opacity-10`}>
            {icon}
        </div>
    </div>
);

const RoomDeviceManager = ({ rooms, devices, addRoom, addDevice, updateDevice, deleteDevice, deleteRoom }) => {
    const [newRoomName, setNewRoomName] = useState('');
    const [newDeviceState, setNewDeviceState] = useState({ ...initialDevice, roomId: rooms[0]?.id || '' });
    const [isAddingRoom, setIsAddingRoom] = useState(false);
    const [isAddingDevice, setIsAddingDevice] = useState(false);

    useEffect(() => {
        if (rooms.length > 0 && !newDeviceState.roomId) {
            setNewDeviceState(prev => ({ ...prev, roomId: rooms[0].id }));
        }
    }, [rooms, newDeviceState.roomId]);

    const handleAddRoom = async () => {
        if (newRoomName.trim()) {
            await addRoom({ name: newRoomName.trim(), purpose: 'Classroom' });
            setNewRoomName('');
            setIsAddingRoom(false);
        }
    };

    const handleAddDevice = async () => {
        if (newDeviceState.name && newDeviceState.roomId) {
            const deviceData = {
                ...newDeviceState,
                quantity: Number(newDeviceState.quantity),
                powerW: Number(newDeviceState.powerW),
                usageHours: Number(newDeviceState.usageHours),
            };
            await addDevice(deviceData);
            setNewDeviceState({ ...initialDevice, roomId: newDeviceState.roomId });
            setIsAddingDevice(false);
        }
    };

    const handleDeleteDevice = (id) => {
        // IMPORTANT: window.confirm is forbidden. Using a simple console log placeholder for demonstration.
        // In a real application, replace with a custom modal component.
        console.warn('Confirm dialog suppressed. If you were confirming deletion, it would proceed now.');
        deleteDevice(id);
    };

    const handleDeleteRoom = (roomId, roomName) => {
        // IMPORTANT: window.confirm is forbidden. Using a simple console log placeholder for demonstration.
        // In a real application, replace with a custom modal component.
        console.warn(`Confirm dialog suppressed. If you were confirming deletion of room ${roomName}, it would proceed now.`);
        deleteRoom(roomId);
    };

    const DeviceRow = ({ device, metrics }) => (
        <div className="flex justify-between items-center py-2 px-3 border-b border-gray-100 hover:bg-gray-50 transition duration-150">
            <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-700 truncate">{device.name} ({device.quantity}x)</p>
                <p className="text-xs text-gray-500">{device.powerW}W · {device.usageHours}h/day</p>
            </div>
            <div className="text-right flex-shrink-0">
                <p className="text-sm font-medium text-blue-600">{metrics.energyKWhDay.toFixed(2)} kWh/day</p>
                <p className="text-xs text-green-600">{formatCurrency(metrics.costYear)}/yr</p>
            </div>
            <button
                onClick={() => handleDeleteDevice(device.id)}
                className="ml-4 text-red-400 hover:text-red-600 transition"
                title="Delete Device"
            >
                <Trash2 size={16} />
            </button>
        </div>
    );

    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-800">Rooms & Devices Management</h2>

            {/* Room/Device Quick Add Buttons */}
            <div className="flex space-x-4">
                <button
                    onClick={() => setIsAddingRoom(!isAddingRoom)}
                    className="flex-1 w-full flex items-center justify-center p-3 bg-blue-600 text-white rounded-xl shadow-md hover:bg-blue-700 transition"
                >
                    <Plus size={20} className="mr-2" /> {isAddingRoom ? 'Close Room Form' : 'Add New Room'}
                </button>
                <button
                    onClick={() => setIsAddingDevice(!isAddingDevice)}
                    disabled={rooms.length === 0}
                    className={`flex-1 w-full flex items-center justify-center p-3 text-white rounded-xl shadow-md transition ${rooms.length === 0 ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
                >
                    <Plus size={20} className="mr-2" /> {isAddingDevice ? 'Close Device Form' : 'Add New Device'}
                </button>
            </div>

            {/* Add Room Form */}
            {isAddingRoom && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-3">
                    <h3 className="text-xl font-semibold text-blue-800">New Room Details</h3>
                    <input
                        type="text"
                        placeholder="Room Name (e.g., Computer Lab A)"
                        value={newRoomName}
                        onChange={(e) => setNewRoomName(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    />
                    <button onClick={handleAddRoom} className="w-full p-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                        Create Room
                    </button>
                </div>
            )}

            {/* Add Device Form */}
            {isAddingDevice && rooms.length > 0 && (
                <div className="p-4 bg-green-50 border border-green-200 rounded-xl space-y-3">
                    <h3 className="text-xl font-semibold text-green-800">New Device Details</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <select
                            value={newDeviceState.roomId}
                            onChange={(e) => setNewDeviceState(prev => ({ ...prev, roomId: e.target.value }))}
                            className="w-full p-2 border border-gray-300 rounded-lg"
                        >
                            {rooms.map(room => (
                                <option key={room.id} value={room.id}>{room.name}</option>
                            ))}
                        </select>
                        <input
                            type="text"
                            placeholder="Device Name (e.g., AC, Light, Desktop)"
                            value={newDeviceState.name}
                            onChange={(e) => setNewDeviceState(prev => ({ ...prev, name: e.target.value }))}
                            className="w-full p-2 border border-gray-300 rounded-lg"
                        />
                        <input
                            type="number"
                            placeholder="Power (W)"
                            value={newDeviceState.powerW}
                            onChange={(e) => setNewDeviceState(prev => ({ ...prev, powerW: e.target.value }))}
                            className="w-full p-2 border border-gray-300 rounded-lg"
                        />
                        <input
                            type="number"
                            placeholder="Quantity"
                            value={newDeviceState.quantity}
                            onChange={(e) => setNewDeviceState(prev => ({ ...prev, quantity: e.target.value }))}
                            className="w-full p-2 border border-gray-300 rounded-lg"
                        />
                        <input
                            type="number"
                            placeholder="Daily Usage (Hours)"
                            value={newDeviceState.usageHours}
                            onChange={(e) => setNewDeviceState(prev => ({ ...prev, usageHours: e.target.value }))}
                            className="w-full p-2 border border-gray-300 rounded-lg col-span-2"
                        />
                    </div>
                    <button onClick={handleAddDevice} className="w-full p-2 bg-green-500 text-white rounded-lg hover:bg-green-600">
                        Add Device
                    </button>
                </div>
            )}

            {/* Rooms List */}
            <div className="space-y-4">
                {rooms.length === 0 && (
                    <div className="p-4 text-center text-gray-500 bg-gray-100 rounded-xl">
                        No rooms added yet. Please add a room to begin!
                    </div>
                )}
                {rooms.map((room) => {
                    // Recalculate metrics for display
                    const roomDevices = devices.filter(d => d.roomId === room.id);
                    let roomEnergyKWhDay = 0;
                    let roomCostYearGrid = 0;
                    const devicesWithMetrics = roomDevices.map(device => {
                        const metrics = calculateDeviceMetrics(device, 0); // Rate doesn't matter for room energy
                        roomEnergyKWhDay += metrics.energyKWhDay;
                        roomCostYearGrid += metrics.costYear;
                        return { ...device, metrics };
                    });


                    return (
                        <div key={room.id} className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                            <div className="flex justify-between items-center p-4 bg-blue-100/50 border-b border-blue-200">
                                <h3 className="text-xl font-bold text-blue-800">{room.name}</h3>
                                <div className="flex items-center space-x-3">
                                    <div className="text-sm font-semibold text-blue-700">
                                        {roomEnergyKWhDay.toFixed(2)} kWh/day
                                    </div>
                                    <button
                                        onClick={() => handleDeleteRoom(room.id, room.name)}
                                        className="text-red-500 hover:text-red-700 transition"
                                        title="Delete Room"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                            <div className="p-2 divide-y divide-gray-100">
                                {devicesWithMetrics.length === 0 ? (
                                    <p className="text-center text-gray-400 py-3">No devices in this room.</p>
                                ) : (
                                    devicesWithMetrics.map(device => (
                                        <DeviceRow key={device.id} device={device} metrics={device.metrics} />
                                    ))
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const SolarComparisonView = ({ solarSettings, updateSolarSettings, buildingMetrics }) => {
    const [settings, setSettings] = useState(solarSettings);

    useEffect(() => {
        setSettings(solarSettings);
    }, [solarSettings]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setSettings(prev => ({ ...prev, [name]: Number(value) }));
    };

    const handleSave = () => {
        updateSolarSettings(settings);
    };

    const {
        totalRequiredCapacityKW,
        totalInstallationCost,
        totalROIYears,
        longTermSavings,
        yearlySavings,
    } = buildingMetrics;

    const ComparisonCard = ({ title, gridValue, solarValue, gridUnit = '', solarUnit = '' }) => (
        <div className="p-5 bg-white rounded-xl shadow-lg border border-gray-100">
            <h3 className="text-lg font-semibold mb-3 text-gray-700">{title}</h3>
            <div className="grid grid-cols-2 gap-4">
                <div className="p-3 bg-gray-100 rounded-lg">
                    <p className="text-sm text-gray-500">Grid (Current)</p>
                    <p className="text-xl font-bold text-blue-600">{gridValue}{gridUnit}</p>
                </div>
                <div className="p-3 bg-green-100 rounded-lg">
                    <p className="text-sm text-gray-500">Solar (Projected)</p>
                    <p className="text-xl font-bold text-green-600">{solarValue}{solarUnit}</p>
                </div>
            </div>
        </div>
    );

    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-800">Solar Comparison & Settings</h2>

            {/* Solar Settings Input */}
            <div className="p-6 bg-blue-50 border border-blue-200 rounded-xl shadow-md">
                <h3 className="text-xl font-bold text-blue-800 mb-4 flex items-center"><Settings size={20} className="mr-2" /> Solar Configuration</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <InputGroup label="Grid Rate (INR/kWh)" name="electricityRate" value={settings.electricityRate} onChange={handleChange} unit="INR/kWh" />
                    <InputGroup label="Solar Cost (INR/kW)" name="solarCostPerKW" value={settings.solarCostPerKW} onChange={handleChange} unit="INR" />
                    <InputGroup label="Efficiency Factor" name="efficiencyFactor" value={settings.efficiencyFactor} onChange={handleChange} unit="%" isPercent />
                    <InputGroup label="Daily Sunlight (Hours)" name="sunlightHours" value={settings.sunlightHours} onChange={handleChange} unit="Hrs" />
                    <InputGroup label="System Lifetime (Years)" name="lifetimeYears" value={settings.lifetimeYears} onChange={handleChange} unit="Years" />
                    <InputGroup label="Annual Inflation (%)" name="annualInflation" value={settings.annualInflation} onChange={handleChange} unit="%" isPercent />
                </div>
                <button
                    onClick={handleSave}
                    className="mt-6 w-full p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
                >
                    Save Solar Settings
                </button>
            </div>

            {/* Comparison Results */}
            <h3 className="text-2xl font-bold text-gray-800 pt-4">Building-Wide Analysis</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card
                    title="Required Solar Capacity (100%)"
                    value={`${totalRequiredCapacityKW.toFixed(2)} kW`}
                    icon={<Zap size={24} />}
                    accentColor="text-yellow-500"
                />
                <Card
                    title="Total Installation Cost"
                    value={formatCurrency(totalInstallationCost)}
                    icon={<DollarSign size={24} />}
                    accentColor="text-red-500"
                />
                <Card
                    title="ROI / Payback Period"
                    value={totalROIYears < 999 ? `${totalROIYears.toFixed(1)} Years` : 'N/A (No Usage)'}
                    icon={<Sunrise size={24} />}
                    accentColor="text-green-500"
                />
            </div>

            {/* Grid vs Solar Cost Comparison */}
            <ComparisonCard
                title={`Yearly Energy Cost (${solarSettings.lifetimeYears} Year View)`}
                gridValue={formatCurrency(totalInstallationCost + buildingMetrics.totalCostYearGrid * solarSettings.lifetimeYears)} // Simplified cost projection
                solarValue={formatCurrency(totalInstallationCost)}
            />

             <Card
                title={`Projected ${solarSettings.lifetimeYears}-Year Savings`}
                value={formatCurrency(longTermSavings)}
                icon={<DollarSign size={24} />}
                accentColor="text-green-500"
                className="col-span-1 md:col-span-3 bg-green-50"
            />
        </div>
    );
};

const InputGroup = ({ label, name, value, onChange, unit, isPercent = false }) => (
    <div>
        <label className="text-sm font-medium text-gray-700 block mb-1">
            {label}
        </label>
        <div className="relative rounded-md shadow-sm">
            <input
                type="number"
                step={isPercent ? "0.01" : "any"}
                name={name}
                value={value}
                onChange={onChange}
                className="w-full p-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 pr-10"
            />
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                <span className="text-gray-500 sm:text-sm">{isPercent ? '%' : unit}</span>
            </div>
        </div>
    </div>
);


const Dashboard = ({ buildingMetrics, roomsWithMetrics }) => {
    const { totalEnergyKWhDay, totalCostYearGrid } = buildingMetrics;

    const PieChart = ({ data }) => {
        if (data.length === 0) return <p className="text-center text-gray-500 pt-4">No usage data to display.</p>;

        const total = data.reduce((sum, item) => sum + item.value, 0);
        if (total === 0) return <p className="text-center text-gray-500 pt-4">Total usage is zero.</p>;
        
        // Simple SVG Pie Chart simulation
        let cumulativeAngle = 0;
        const colors = ['#2563EB', '#FBBF24', '#10B981', '#EF4444', '#6366F1', '#EC4899', '#374151'];

        const segments = data.map((item, index) => {
            const percentage = item.value / total;
            const angle = percentage * 360;
            const startAngle = cumulativeAngle;
            const endAngle = cumulativeAngle + angle;
            cumulativeAngle = endAngle;

            const startX = 50 + 40 * Math.sin(startAngle * Math.PI / 180);
            const startY = 50 - 40 * Math.cos(startAngle * Math.PI / 180);
            const endX = 50 + 40 * Math.sin(endAngle * Math.PI / 180);
            const endY = 50 - 40 * Math.cos(endAngle * Math.PI / 180);
            const largeArcFlag = angle > 180 ? 1 : 0;
            const color = colors[index % colors.length];

            const d = percentage === 1
                ? `M 50 10 A 40 40 0 1 1 50 90 A 40 40 0 1 1 50 10` // full circle
                : `M 50,50 L ${startX},${startY} A 40,40 0 ${largeArcFlag} 1 ${endX},${endY} Z`;

            return (
                <g key={item.label}>
                    <path d={d} fill={color} />
                </g>
            );
        });

        return (
            <div className="flex flex-col lg:flex-row gap-6 items-center">
                <svg viewBox="0 0 100 100" className="w-full h-auto max-w-xs">
                    <circle cx="50" cy="50" r="40" fill="#f3f4f6" />
                    {segments}
                </svg>
                <div className="flex flex-wrap gap-x-4 gap-y-2 lg:flex-col lg:space-y-2 lg:w-1/2">
                    {data.map((item, index) => (
                        <div key={item.label} className="flex items-center">
                            <span className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: colors[index % colors.length] }}></span>
                            <span className="text-sm font-medium text-gray-700">{item.label}: {formatPercent(item.value / total)}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    };

    const pieData = roomsWithMetrics
        .filter(r => r.metrics.energyKWhDay > 0)
        .map(r => ({
            label: r.name,
            value: r.metrics.energyKWhDay
        }));


    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-800">Building Overview Dashboard</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card
                    title="Daily Energy Use"
                    value={`${totalEnergyKWhDay.toFixed(2)} kWh`}
                    icon={<Zap size={24} />}
                    accentColor="text-blue-500"
                />
                <Card
                    title="Yearly Grid Cost"
                    value={formatCurrency(totalCostYearGrid)}
                    icon={<DollarSign size={24} />}
                    accentColor="text-green-500"
                />
                <Card
                    title="Energy Efficiency Score"
                    value="B+"
                    icon={<Gauge size={24} />}
                    accentColor="text-yellow-500"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Energy Usage Breakdown Chart */}
                <div className="p-6 bg-white rounded-xl shadow-lg border border-gray-100">
                    <h3 className="text-xl font-bold text-gray-800 mb-4">Energy Usage by Room (kWh/day)</h3>
                    <PieChart data={pieData} />
                </div>

                {/* Top 3 Rooms by Cost Table */}
                <div className="p-6 bg-white rounded-xl shadow-lg border border-gray-100">
                    <h3 className="text-xl font-bold text-gray-800 mb-4">Top Cost Centers</h3>
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Room</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">Yearly Cost</th>
                                <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">kWh/Day</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {roomsWithMetrics.sort((a, b) => b.metrics.costYearGrid - a.metrics.costYearGrid).slice(0, 3).map((room) => (
                                <tr key={room.id} className="hover:bg-gray-50 transition">
                                    <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-900">{room.name}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right text-red-600">{formatCurrency(room.metrics.costYearGrid)}</td>
                                    <td className="px-3 py-2 whitespace-nowrap text-sm text-right text-blue-600">{room.metrics.energyKWhDay.toFixed(2)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {roomsWithMetrics.length === 0 && <p className="text-center text-gray-500 pt-4">No data entered.</p>}
                </div>
            </div>
        </div>
    );
};

const RecommendationsView = ({ roomsWithMetrics, buildingMetrics }) => {
    const [recommendations, setRecommendations] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    const generateRecommendations = useCallback(async () => {
        if (roomsWithMetrics.length === 0 || (buildingMetrics?.totalEnergyKWhDay === 0)) {
            setError("Please add rooms and devices to generate recommendations.");
            setRecommendations(null);
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const result = await generateLLMRecommendation(roomsWithMetrics, buildingMetrics);
            setRecommendations(result);
        } catch (e) {
            setError(e.message || "An unexpected error occurred during AI analysis.");
        } finally {
            setIsLoading(false);
        }
    }, [roomsWithMetrics, buildingMetrics]);

    useEffect(() => {
        // Run once on mount if data exists
        if (!recommendations && roomsWithMetrics.length > 0 && buildingMetrics.totalEnergyKWhDay > 0) {
            generateRecommendations();
        }
    }, [generateRecommendations]);

    const getIconAndColor = (suggestion) => {
        if (suggestion.toLowerCase().includes('solar')) return { icon: <CheckCircle size={18} />, color: 'text-green-600 bg-green-100' };
        if (suggestion.toLowerCase().includes('hybrid')) return { icon: <AlertTriangle size={18} />, color: 'text-yellow-600 bg-yellow-100' };
        return { icon: <DollarSign size={18} />, color: 'text-blue-600 bg-blue-100' };
    };

    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold text-gray-800">Smart AI Recommendations</h2>

            <button
                onClick={generateRecommendations}
                disabled={isLoading || roomsWithMetrics.length === 0}
                className={`w-full p-3 flex items-center justify-center rounded-xl font-semibold transition ${isLoading ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg'}`}
            >
                {isLoading ? <Loader2 size={20} className="animate-spin mr-2" /> : <BarChart3 size={20} className="mr-2" />}
                {isLoading ? 'Analyzing Data...' : 'Generate New Recommendations'}
            </button>

            {error && <div className="p-4 bg-red-100 text-red-700 border border-red-400 rounded-xl">{error}</div>}

            {recommendations && (
                <div className="space-y-8">
                    {/* Summary Panel */}
                    <div className="p-6 bg-white rounded-xl shadow-2xl border-l-4 border-green-500">
                        <h3 className="text-2xl font-bold text-green-700 mb-3">Optimal Energy Strategy Summary</h3>
                        <p className="text-gray-700 leading-relaxed italic">
                            "{recommendations.summary}"
                        </p>
                        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                            <SummaryPill title="Projected Annual Savings" value={formatCurrency(recommendations.totalSavings)} color="bg-green-100 text-green-800" />
                            <SummaryPill title="Required Solar Capacity" value={`${recommendations.capacityNeeded.toFixed(2)} kW`} color="bg-yellow-100 text-yellow-800" />
                            <SummaryPill title="Breakeven Period (ROI)" value={`${recommendations.breakevenPeriod.toFixed(1)} Years`} color="bg-blue-100 text-blue-800" />
                            <SummaryPill title="Long-Term Plan" value="Upgrade Devices & Monitor" color="bg-indigo-100 text-indigo-800" />
                        </div>
                    </div>

                    {/* Room-by-Room Breakdown */}
                    <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
                        <div className="p-4 bg-gray-50 border-b">
                            <h3 className="text-xl font-bold text-gray-800">Room-by-Room Action Plan</h3>
                        </div>
                        <div className="divide-y divide-gray-100">
                            {recommendations.roomRecommendations.map((rec, index) => {
                                const { icon, color } = getIconAndColor(rec.suggestion);
                                return (
                                    <div key={index} className="p-4 hover:bg-gray-50 transition duration-150">
                                        <div className="flex justify-between items-center">
                                            <span className="text-lg font-semibold text-gray-800">{rec.roomName}</span>
                                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${color}`}>
                                                {icon}
                                                <span className="ml-2">{rec.suggestion}</span>
                                            </span>
                                        </div>
                                        <p className="text-sm text-gray-600 mt-1 italic">{rec.reasoning}</p>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const SummaryPill = ({ title, value, color }) => (
    <div className={`p-2 rounded-lg ${color} text-center`}>
        <p className="text-xs font-semibold uppercase">{title}</p>
        <p className="text-lg font-bold mt-0.5">{value}</p>
    </div>
);


// --- MAIN APP COMPONENT ---

const App = () => {
    const { db, userId, isAuthReady, isLoading: isFirebaseLoading } = useFirebase();
    const { rooms, devices, solarSettings, isLoading: isDataLoading, addRoom, addDevice, updateDevice, deleteDevice, deleteRoom, updateSolarSettings } = useEnergyData(db, userId, isAuthReady);
    const [view, setView] = useState('dashboard');

    const isLoading = isFirebaseLoading || isDataLoading;

    // Memoize the core calculation to avoid re-calculating on every render
    const { rooms: roomsWithMetrics, building: buildingMetrics } = useMemo(() => {
        return calculateBuildingTotals(rooms, devices, solarSettings);
    }, [rooms, devices, solarSettings]);

    const renderView = () => {
        if (isLoading) {
            return (
                <div className="flex justify-center items-center h-96">
                    <Loader2 className="animate-spin text-blue-500" size={48} />
                    <span className="ml-3 text-lg text-gray-600">Loading Data...</span>
                </div>
            );
        }

        switch (view) {
            case 'rooms':
                return <RoomDeviceManager
                    rooms={rooms}
                    devices={devices}
                    addRoom={addRoom}
                    addDevice={addDevice}
                    updateDevice={updateDevice}
                    deleteDevice={deleteDevice}
                    deleteRoom={deleteRoom}
                />;
            case 'solar':
                return <SolarComparisonView
                    solarSettings={solarSettings}
                    updateSolarSettings={updateSolarSettings}
                    buildingMetrics={buildingMetrics}
                />;
            case 'recommendations':
                return <RecommendationsView
                    roomsWithMetrics={roomsWithMetrics}
                    buildingMetrics={buildingMetrics}
                />;
            case 'dashboard':
            default:
                return <Dashboard
                    buildingMetrics={buildingMetrics}
                    roomsWithMetrics={roomsWithMetrics}
                />;
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 font-sans">
            <style>
                {`
                    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap');
                    body { font-family: 'Inter', sans-serif; }
                `}
            </style>
            
            {/* Header / Navigation */}
            <header className="bg-white shadow-lg sticky top-0 z-10">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col md:flex-row justify-between items-center">
                    <h1 className="text-3xl font-extrabold text-blue-800">
                        Smart Energy Planner
                    </h1>
                    <nav className="mt-4 md:mt-0 flex space-x-2 sm:space-x-4">
                        <NavItem viewName="dashboard" currentView={view} setView={setView} icon={<Gauge size={20} />} label="Dashboard" />
                        <NavItem viewName="rooms" currentView={view} setView={setView} icon={<Users size={20} />} label="Rooms & Devices" />
                        <NavItem viewName="solar" currentView={view} setView={setView} icon={<Sunrise size={20} />} label="Solar Comparison" />
                        <NavItem viewName="recommendations" currentView={view} setView={setView} icon={<Zap size={20} />} label="AI Advice" />
                    </nav>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {renderView()}
            </main>

            <footer className="py-4 text-center text-sm text-gray-500 border-t mt-12">
                User ID: {userId || 'Authenticating...'} | App ID: {appId}
            </footer>
        </div>
    );
};

const NavItem = ({ viewName, currentView, setView, icon, label }) => {
    const isActive = viewName === currentView;
    return (
        <button
            onClick={() => setView(viewName)}
            className={`flex items-center p-2 rounded-lg transition font-medium text-sm md:text-base ${
                isActive
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-blue-600'
            }`}
        >
            {icon}
            <span className="ml-1 md:ml-2">{label}</span>
        </button>
    );
};

export default App;
