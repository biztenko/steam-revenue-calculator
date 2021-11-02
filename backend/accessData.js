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
                appsPrice[app.appid]?.data?.price_overview?.initial,
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
    //update complete app details
    ProcessUpdateGameDetails: async function () {
        let apps = await this.GetAllAppsFromDB();
        //if there is an error, resume from slice index
        const initialChunk = 0;
        let counter = 0;
        apps = apps.rows.slice(initialChunk);
        for (let app of apps) {
            await this.sleep(2000);
            console.log(`current chunk: ${initialChunk + counter}`);
            try {
                const appWithDetails = await this.GetAppDetailsFromSteamAPI(app);
                await this.UpdateAppDetailsInDB(appWithDetails);
            }
            catch (err) {
                console.log(`chunk failed from ${initialChunk + counter}`)
                console.log(err);
                return;
            }
            counter++;
        }
    },
    GetAppDetailsFromSteamAPI: async function (app) {
        try {
            const results = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${app.appid}&cc=us`);
            return results.data[app.appid];
        }
        catch (err) {
            throw err;
        }
    },
    UpdateAppDetailsInDB: async function (appDetails) {
        let query = 'UPDATE game SET\
        initial_price = $1,\
        type = $2,\
        required_age = $3,\
        is_free = $4,\
        detailed_description = $5,\
        about_the_game = $6,\
        short_description = $7,\
        supported_languages = $8,\
        header_image = $9,\
        website = $10,\
        final_price = $11,\
        discount_percent = $12,\
        metacritic_score = $13,\
        recommendations = $14,\
        release_date = $15,\
        platforms_windows = $16,\
        platforms_mac = $17,\
        platforms_linux = $18\
        WHERE appid = $19';

        let values = [
            appDetails?.data?.price_overview?.initial,
            appDetails?.data?.type,
            appDetails?.data?.required_age,
            appDetails?.data?.is_free,
            appDetails?.data?.detailed_description,
            appDetails?.data?.about_the_game,
            appDetails?.data?.short_description,
            appDetails?.data?.supported_languages,
            appDetails?.data?.header_image,
            appDetails?.data?.website,
            appDetails?.data?.price_overview?.final,
            appDetails?.data?.price_overview?.discount_percent,
            appDetails?.data?.metacritic?.score,
            appDetails?.data?.recommendations?.total,
            appDetails?.data?.release_date?.date,
            appDetails?.data?.platforms?.windows,
            appDetails?.data?.platforms?.mac,
            appDetails?.data?.platforms?.linux,
            appDetails?.data?.steam_appid
        ];
        try {
            const results = await pool.query(query, values);
            console.log(`Inserted ${appDetails?.data?.name} into database.`);
        }
        catch (err) {
            console.log(err.message);
        }

        query = 'INSERT INTO game_categories (appid, id, description)\
        VALUES ($1, $2, $3)\
        ON CONFLICT (appid) DO UPDATE\
        SET id = $2, description = $3'

        values = [
            appDetails?.data?.steam_appid,
            appDetails?.data?.genres?.id,
            appDetails?.data?.genres?.description
        ]
        try {
            const results = await pool.query(query, values);
            console.log(`Inserted ${appDetails?.data?.name} (categories) into database.`);
        }
        catch (err) {
            console.log(err.message);
        }
        query = 'INSERT INTO game_genres (appid, id, description)\
        VALUES ($1, $2, $3)\
        ON CONFLICT (appid) DO UPDATE\
        SET id = $2, description = $3'

        values = [
            appDetails?.data?.steam_appid,
            appDetails?.data?.categories?.id,
            appDetails?.data?.categories?.description
        ]
        try {
            const results = await pool.query(query, values);
            console.log(`Inserted ${appDetails?.data?.name} (genres) into database.`);
        }
        catch (err) {
            console.log(err.message);
        }
    },
    //update app review count
    sleep: async function (ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }
}

module.exports = accessData;