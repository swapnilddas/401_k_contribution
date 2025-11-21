# 401(k) Contribution Settings Application

This project is a simple full-stack web application that simulates how an employee can adjust their 401(k) contribution settings. I used:

- A **React (Vite)** frontend for an interactive UI  
- A **Node.js + Express** backend that provides mock data and accepts contribution updates  
- Dynamic projections showing estimated retirement balances under different market scenarios  


##  How to Run the Application

1 - Install Dependencies: 
BACKEND:
cd backend
npm install
FRONTEND:
cd frontend
npm install

2 - go to backend and type:
npm start

3 - go to frontend and type:
npm run dev

4 - click on the local URL you receive on terminal (e.g - http://localhost:5173)

5 - 
Once both servers are running:

- Frontend loads mock data from the backend

- You can change contribution type (% or $)

- Adjust contribution value

- Toggle employer match

- View updated snapshot + projections

- Save settings → backend receives POST request