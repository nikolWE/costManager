The main purpose of this project is to build the backend infrastructure for a Cost Manager application using a microservices architecture. Developed with Express.js and MongoDB, and deployed on Render, the system exposes a set of RESTful Web Services divided across four independent processes that handle user management, expense tracking, system logging, and administrative details.

Functions:
Adding User-
Adding a user by entering id, first and last name, and birthday. The birthday can not be a date in the future.
https://users-service-l21v.onrender.com/api/add
{
id: ______,
first name: "______",
last name: "______",
birthday: YYYY-MM-DD
}

Getting The Details of a Specific User-
Retruns a JSON document with user's id, first and last name and the total of costs for this user.
https://users-service-l21v.onrender.com/api/users/______

List of Users-
Retruns a JSON document with list of the users. The user's id is id:, and the _id: is the id from mongoDB.
https://users-service-l21v.onrender.com/api/users

Developers Team-
Retruns a JSON document with the details about the developers. 
https://admin-service-c1oo.onrender.com/api/about

Adding Cost Items-
Adding cost item by entering user's id, sum of the cost, category (for example food, electronics, sports, etc.), description (for example coffee, phone, baseball bat, etc.), and the date that the cost was created. Sum also accepts decimal numbers. If nothing is entered in the createdAt field today's date is going to be assigned. 
https://costs-service-aw7k.onrender.com/api/add
{
  userid:_____,
  sum:_____,
  category: "______",
  description: "______",
  createdAt: YYYY-MM-DD
}

Getting Monthly Report-
Retruns a JSON document with list of all the costs arranged by category, for a specific user in a specific month and year.
https://costs-service-aw7k.onrender.com/api/report?userid=______&year=YYYY&month=MM

List of Logs-
Retruns a JSON document with list of all the requests that were sent to each of the servers. 
https://logs-service-7rzi.onrender.com/api/logs
