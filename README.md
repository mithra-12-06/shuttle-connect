

\# Shuttle Connect



\### Smart Shuttle Booking and Fleet Operations Portal



Shuttle Connect is a web-based shuttle reservation and management

system designed to simplify scheduled shuttle transportation.

It provides passengers with a convenient booking experience and

administrators with tools to manage shuttle operations.



\## Features



\- Passenger registration and login

\- Secure authentication using JWT

\- Password hashing using bcrypt

\- Scheduled trip search

\- Real-time seat availability

\- Multiple-seat booking

\- Unique booking references

\- Booking history and cancellation

\- Role-based access control

\- Administrative trip and fleet management

\- Concurrent booking protection



\## Technology Stack



\### Frontend

\- HTML5

\- CSS3

\- JavaScript



\### Backend

\- Node.js

\- Native HTTP module

\- REST APIs



\### Database

\- MySQL

\- WAMP Server

\- phpMyAdmin



\### Security and Libraries

\- JSON Web Token (JWT)

\- bcryptjs

\- dotenv



\### Development Tools

\- Visual Studio Code

\- PowerShell

\- Git and GitHub



\## Project Structure



```text

shuttle\_connect\_project/

│

├── backend/

│   ├── config/

│   ├── controllers/

│   ├── routes/

│   ├── server.js

│   └── package.json

│

├── frontend/

│   ├── css/

│   ├── js/

│   └── \*.html

│

├── .gitignore

└── README.md

```



\## Installation and Setup



1\. Clone the repository.



&#x20;  git clone YOUR\_GITHUB\_REPOSITORY\_URL



2\. Navigate to the backend directory.



&#x20;  cd shuttle\_connect\_project/backend



3\. Install dependencies.



&#x20;  npm install



4\. Configure the environment variables using your

&#x20;  local environment configuration.



5\. Set up the MySQL database and import the project

&#x20;  database schema.



6\. Start the backend server.



&#x20;  node server.js



7\. Open the frontend using VS Code Live Server.



\## Testing



The application has been tested for:



\- Passenger authentication

\- User registration and login

\- Booking API functionality

\- Seat availability verification

\- Concurrent booking requests

\- Prevention of duplicate seat allocation



\## Project Status



Under development.



\## License



This project is developed for educational and

internship purposes.



