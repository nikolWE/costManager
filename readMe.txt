The main purpose of this project is to build the backend infrastructure for a Cost Manager application using a microservices architecture. Developed with Express.js and MongoDB, and deployed on Render, the system exposes a set of RESTful Web Services divided across four independent processes that handle user management, expense tracking, system logging, and administrative details.

Functions:
Adding User-
Adding a user by entering id, first and last name, and birthday.
https://users-service-l21v.onrender.com/api/add
{
id: ______,
first name: ______,
last name: ______,
birthday: YYYY-MM-DD
}

Getting The Details of a Specific User-
By entering the user's id in the api request.
https://users-service-l21v.onrender.com/api/users/IDNUM

List of Users-
Getting the list of the users. The user's id is id:, and the _id: is the id from mongoDB.
https://users-service-l21v.onrender.com/api/users

Developers Team-
An about page about the developers. 
https://admin-service-c1oo.onrender.com/api/about

Adding Cost Items-
Adding cost item by entering 


Getting Monthly Report-


List of Logs-
