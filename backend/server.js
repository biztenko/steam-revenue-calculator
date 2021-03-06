const express = require('express');
const app = express();
const port = process.env.port || 5000;
const axios = require('axios');
const cors = require('cors');

const accessData = require('./accessData.js');

app.use(cors());


//accessData.ProcessInsertGames();
//accessData.ProcessInsertPrice();
//accessData.ProcessInsertGameDetails(25309);
accessData.ProcessInsertGameReviewCount(8183);

app.listen(port, err => {
    if (err)
        console.log(err);
    console.log(`Listening on port ${port}...`);
})