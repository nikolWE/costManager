require('dotenv').config();

const User = require('./models/User');
const express = require('express');
const mongoose = require('mongoose');
const app = express();

app.use(express.json());

mongoose.connect(process.env.MONGODB_URI).then(()=> {
    console.log('MongoDB connected');
})
    .catch(err => {
        console.log('MongoDB connection fail',err);
    });

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);

});

/* זה בדיקה של הופעת הdb במסך בעמוד שלנו -http://localhost:3000/test-user
בפועל זה צריך להיות עם post במקום get , לשים לב שנצטרך למחוק את השורה הזאתי מאוחר יותר.
זה רק לצורך בדיקה , אצלינו זה יהיה דרך /api/users
app.get('/test-user', async (req, res) => {
    try {
        const existing = await User.findOne({id :123123})
        if (existing) {
            return res.json({note: 'already exists', user: existing});
        }
        const user = await User.create({
            id: 123123,
            first_name: 'mosh',
            last_name: 'israeli',
            birthday: new Date('1999-01-01')
        });
        res.json(user);
    } catch (err) {
        res.status(500).json({ id: 1, message: err.message });
    }
});
 */