# ☀️ AI-Powered Smart Solar Energy Planner

## Project Overview
The Smart Solar Energy Planner is a data-driven web application designed to help users, such as college facility managers or homeowners, accurately calculate their energy consumption, determine the required solar system size, and evaluate the financial return on investment (ROI). It moves beyond simple calculators by offering real-time data persistence and a foundation for AI-powered optimization advice using the Google Gemini API.

## ✨ Key Features
This application provides a comprehensive solution for initial solar planning and consumption tracking:

- **Real-time Consumption Modeling:** Users can define multiple rooms and add specific devices (power rating, quantity, usage hours) to build an accurate, aggregated consumption profile in real-time.
- **Core Energy Calculation Engine:** Instantly quantifies total daily energy consumption (in kWh) and calculates the crucial estimated solar system size (kW) required to cover 100% of the calculated load.
- **ROI & Payback Analysis:** Provides immediate financial metrics, including yearly savings and the Payback Period (ROI) based on user-defined electricity rates and solar installation costs.
- **Data Persistence with Firestore:** Engineered with Firebase Firestore to securely store user-specific consumption data (rooms, devices, usage) under private paths, ensuring persistent data across multiple sessions.
- **AI Recommendation Ready (Future):** Integrated the Gemini API for future personalized, AI-driven recommendations on energy efficiency, device replacement, and optimized solar installation strategies.
- **Zero-Friction Authentication:** Utilizes Firebase Authentication (Anonymous/Custom Token) for secure, multi-session user persistence without requiring a cumbersome sign-up process.
- **Responsive & Modern UI:** Built with ReactJS and styled using Tailwind CSS for a modern, accessible, and fully responsive user experience.

## 🛠️ Tech Stack

| Category       | Technology       | Purpose                                                      |
|----------------|-----------------|--------------------------------------------------------------|
| Frontend       | ReactJS          | Building a modern, dynamic, and stateful user interface.     |
| Styling        | Tailwind CSS     | Utility-first CSS framework for rapid and responsive styling.|
| Database       | Firebase Firestore | Real-time, NoSQL cloud database for data persistence.      |
| Authentication | Firebase Auth    | Secure, anonymous/custom token user session management.     |
| AI/ML          | Gemini API       | Foundation for personalized energy optimization and advice. |

### Prerequisites
- Node.js (LTS version recommended) and npm
- A Google Cloud Project with the Gemini API enabled (for AI features)
- A Firebase Project (for Authentication and Firestore)

---

