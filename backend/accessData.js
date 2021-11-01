const pg = require('pg').Pool;
const connectionSettings = require('./connectionSettings.js');
const pool = new pg(connectionSettings);

const axios = require('axios');

const accessData = {
    //retrieve all apps from steam and insert to DB
    ProcessInsertGames: async function () {
        const steamApps = await this.GetAllAppFromSteamAPI();
        this.InsertGamesIntoDB(steamApps);
    },
    GetAllAppFromSteamAPI: async function () {
        try {
            const steamApps = await axios.get('https://api.steampowered.com/ISteamApps/GetAppList/v2/');
            return steamApps.data.applist.apps;
        }
        catch (err) {
            console.log(err);
        }
    },
    InsertGamesIntoDB: async function (steamApps) {
        for (let app of steamApps) {
            const query = 'INSERT INTO game(appid, name) VALUES($1, $2) ON CONFLICT (appid) DO NOTHING';
            const values = [app.appid, app.name];
            try {
                const results = await pool.query(query, values);
                console.log(`Inserted ${app.name} into database.`);
            }
            catch (err) {
                console.log(err.message);
            }
        }
    },
    //update PRICE ONLY of apps in DB
    ProcessUpdatePrice: async function () {
        let apps = await this.GetAllAppsFromDB();
        //if there is an error, resume from slice index
        const initialChunk = 65800;
        apps = apps.rows.slice(initialChunk);
        const chunkSize = 700;
        const numOfChunk = Math.floor(apps.length / chunkSize);

        for (let i = 0; i < numOfChunk + 1; i++) {
            await this.sleep(2000);
            const startIndex = i * chunkSize;
            const endIndex = ((i + 1) * chunkSize) - 1;
            console.log(`current chunk: ${startIndex + initialChunk} => ${endIndex + initialChunk}`);
            try {
                const appsChunk = apps.slice(startIndex, endIndex + 1);
                const appsWithPrice = await this.GetAppPriceFromSteamAPI(appsChunk);
                console.log(`updating chunk from ${i}: ${startIndex + initialChunk} => ${endIndex + initialChunk}`)
                await this.UpdateAppPriceInDB(appsChunk, appsWithPrice);
            }
            catch (err) {
                console.log(`chunk failed from ${startIndex + initialChunk} => ${endIndex + initialChunk}`)
                console.log(err.response.status);
                return;
            }
        }
    },
    GetAllAppsFromDB: async function () {
        const query = 'SELECT * FROM game ORDER by appid';
        try {
            const results = await pool.query(query);
            return results;
        }
        catch (err) {
            console.log(err.message);
        }
    },
    GetAppPriceFromSteamAPI: async function (apps) {
        let appendRequest = '';
        for (let app of apps) {
            appendRequest += app.appid + ',';
        }
        appendRequest = appendRequest.slice(0, -1);
        try {
            const results = await axios.get(`http://store.steampowered.com/api/appdetails?appids=${appendRequest}&cc=uc&filters=price_overview`);
            return results.data;
        }
        catch (err) {
            throw err;
        }
    },
    UpdateAppPriceInDB: async function (apps, appsPrice) {
        for (let app of apps) {
            const query = 'UPDATE game SET initial_price = $1 WHERE appid = $2';
            const values = [
                appsPrice[app.appid]?.data?.price_overview?.initial || 0,
                app.appid
            ];
            try {
                const results = await pool.query(query, values);
                console.log(`Inserted ${app.name} into database.`);
            }
            catch (err) {
                console.log(err.message);
            }
        }
    },
    sleep: async function (ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }
}

module.exports = accessData;