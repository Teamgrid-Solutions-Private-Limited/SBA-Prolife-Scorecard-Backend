// Load environment-specific configurations
const path = require('path');
const envFile = process.env.NODE_ENV === 'production' ? '.env.production' : '.env';
require('dotenv').config({ path: path.join(__dirname, envFile) });

const express = require('express');
const cors = require("cors");
const morgan = require('morgan');

const connection = require('./db/connection');
const userRoute = require('./routes/userRoutes');
const senatorRoute = require('./routes/senatorRoutes');
const senatorDataRoute = require('./routes/senatorDataRoutes');
const termRoute = require('./routes/termRoutes');
const voteRoute = require('./routes/voteRoutes');
const activityRoute = require('./routes/activityRoutes');
const houseDataRoute = require('./routes/representativeDataRoutes');
const houseRoute = require('./routes/representativeRoutes');
const dummyDataRoute = require('./routes/demoRoutes');
const getquorumRoute = require('./routes/getQuorumRoutes');
const sendInviteRoute = require('./routes/inviteUserRoute');

const app = express();
const PORT = process.env.PORT || 4000;

// Log environment mode
console.log(`Server starting in ${process.env.NODE_ENV || 'development'} mode`);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({extended:true}));
const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));


app.use('/user', userRoute);
app.use('/api',sendInviteRoute);
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