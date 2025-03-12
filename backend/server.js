require("dotenv").config();
const express = require('express');
const cors = require("cors");


const connection =require('./db/connection');
const userRoute =require('./routes/userRoutes');
const senatorRoute=require('./routes/senatorRoutes');
const senatorDataRoute= require('./routes/senatorDataRoutes');
const termRoute= require('./routes/termRoutes');
const voteRoute=require('./routes/voteRoutes');
const activityRoute= require('./routes/activityRoutes');
const houseDataRoute = require('./routes/representativeDataRoutes');
const houseRoute = require('./routes/representativeRoutes');
const dummyDataRoute = require('./routes/demoRoutes');
const getquorumRoute = require('./routes/getQuorumRoutes');
const app = express();
const path = require('path');
const PORT= process.env.PORT || 4000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


app.use('/user',userRoute);
app.use('/senator',senatorRoute);
app.use('/senatorData',senatorDataRoute);
app.use('/term',termRoute);
app.use('/vote',voteRoute);
app.use('/activity',activityRoute);
app.use('/house',houseRoute);
app.use('/houseData',houseDataRoute);
app.use('/fetch-quorum',getquorumRoute);
app.use('/dummy-data',dummyDataRoute);


app.get("/", (req, res) => {
    res.send("Welcome to the homepage!");
  });

app.listen(PORT,()=>{
    console.log(`server is running on port ${PORT}`);
    
})  