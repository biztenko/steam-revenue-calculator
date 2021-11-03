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
    //insert complete app details
    ProcessInsertGameDetails: async function (initialChunk) {
        let apps = await this.GetAllAppsFromDB();
        //if there is an error, resume from slice index
        let counter = 0;
        apps = apps.rows.slice(initialChunk);
        for (let app of apps) {
            //delay for rate limiting
            await this.sleep(1500);
            console.log(`current chunk: ${initialChunk + counter}`);
            try {
                let appDetails = await this.GetAppDetailsFromSteamAPI(app);
                //if steam returns undefined json
                if (appDetails?.success == false) {
                    counter++;
                    continue;
                }
                appDetails = this.SanitizeJSON(appDetails);

                await this.InsertAppDetailsInDB(app, appDetails);
                await this.InsertAppGenresInDB(app, appDetails);
                await this.InsertAppCategoriesInDB(app, appDetails);
                await this.InsertAppDevelopersInDB(app, appDetails);
                await this.InsertAppPublishersInDB(app, appDetails);
            }
            catch (err) {
                console.log(`chunk failed from ${initialChunk + counter}`)
                console.log(err);
                this.ProcessInsertGameDetails(initialChunk + counter);
                return;
            }
            counter++;
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
    GetAppDetailsFromSteamAPI: async function (app) {
        try {
            const results = await axios.get(`https://store.steampowered.com/api/appdetails?appids=${app.appid}&cc=us`);
            return results.data[app.appid];
        }
        catch (err) {
            throw err;
        }
    },
    InsertAppDetailsInDB: async function (app, appDetails) {
        let query = 'INSERT INTO game_details\
        (appid,\
        name,\
        initial_price,\
        type,\
        required_age,\
        is_free,\
        detailed_description,\
        about_the_game,\
        short_description,\
        supported_languages,\
        header_image,\
        website,\
        final_price,\
        discount_percent,\
        metacritic_score,\
        recommendations,\
        release_date,\
        platforms_windows,\
        platforms_mac,\
        platforms_linux)\
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)\
        ON CONFLICT DO NOTHING';

        let values = [
            app.appid,
            appDetails?.data?.name,
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
            appDetails?.data?.platforms?.linux
        ];
        try {
            const results = await pool.query(query, values);
            console.log(`Inserted ${appDetails?.data?.name} into database.`);
        }
        catch (err) {
            throw (err);
        }
    },
    InsertAppGenresInDB: async function (app, appDetails) {
        if (appDetails?.data?.genres == null)
            return;
        for (let genre of appDetails.data.genres) {
            query = 'INSERT INTO game_genres (appid, id, description) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING';
            values = [
                app.appid,
                genre.id,
                genre.description
            ]
            try {
                const results = await pool.query(query, values);
                console.log(`Inserted ${appDetails?.data?.name} (genre ${genre.description}) into database.`);
            }
            catch (err) {
                throw (err);
            }
        }
    },
    InsertAppCategoriesInDB: async function (app, appDetails) {
        if (appDetails?.data?.categories == null)
            return;
        for (let category of appDetails.data.categories) {
            query = 'INSERT INTO game_categories (appid, id, description) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING';

            values = [
                app.appid,
                category.id,
                category.description
            ]
            try {
                const results = await pool.query(query, values);
                console.log(`Inserted ${appDetails?.data?.name} (category ${category.description}) into database.`);
            }
            catch (err) {
                throw (err);
            }
        }

    },
    InsertAppPublishersInDB: async function (app, appDetails) {
        if (appDetails?.data?.publishers == null)
            return;
        for (let publisher of appDetails.data.publishers) {
            query = 'INSERT INTO game_publishers (appid, name) VALUES ($1, $2) ON CONFLICT DO NOTHING';
            values = [
                app.appid,
                publisher
            ]
            try {
                const results = await pool.query(query, values);
                console.log(`Inserted ${appDetails?.data?.name} (publisher ${publisher}) into database.`);
            }
            catch (err) {
                throw (err);
            }
        }
    },
    InsertAppDevelopersInDB: async function (app, appDetails) {
        if (appDetails?.data?.developers == null)
            return;
        for (let developer of appDetails.data.developers) {
            query = 'INSERT INTO game_developers (appid, name) VALUES ($1, $2) ON CONFLICT DO NOTHING';
            values = [
                app.appid,
                developer
            ]
            try {
                const results = await pool.query(query, values);
                console.log(`Inserted ${appDetails?.data?.name} (developer: ${developer}) into database.`);
            }
            catch (err) {
                throw (err);
            }
        }
    },
    //update app review count
    ProcessInsertGameReviewCount: async function (initialChunk) {
        let apps = await this.GetAllGameAppsOnlyFromDB();
        let counter = 0;
        apps = apps.rows.slice(initialChunk);
        for (let app of apps) {
            await this.sleep(1200);
            console.log(`current chunk: ${initialChunk + counter}`);
            try {
                let appDetails = await this.GetGameReviewCountFromSteamAPI(app);
                //if steam returns undefined json
                if (appDetails?.success == false) {
                    counter++;
                    continue;
                }
                await this.InsertGameReviewCountIntoDB(app, appDetails);
            }
            catch (err) {
                console.log(`chunk failed from ${initialChunk + counter}`)
                console.log(err);
                this.ProcessInsertGameReviewCount(initialChunk + counter);
                return;
            }
            counter++;
        }
    },
    GetAllGameAppsOnlyFromDB: async function () {
        const query = `SELECT appid, name FROM game_details WHERE type = 'game' ORDER BY appid`;
        try {
            const results = await pool.query(query);
            return results;
        }
        catch (err) {
            console.log(err.message);
        }
    },
    GetGameReviewCountFromSteamAPI: async function (app) {
        try {
            const results = await axios.get(`https://store.steampowered.com/appreviews/${app.appid}?json=1&num_per_page=0&language=all`);
            return results.data;
        }
        catch (err) {
            throw err;
        }
    },
    InsertGameReviewCountIntoDB: async function (app, appReviewDetails) {
        let query = 'UPDATE game_details SET\
        review_score = $1,\
        review_score_desc = $2,\
        total_positive = $3,\
        total_negative = $4,\
        total_reviews = $5\
        WHERE appid = $6';

        let values = [
            appReviewDetails?.query_summary?.review_score,
            appReviewDetails?.query_summary?.review_score_desc,
            appReviewDetails?.query_summary?.total_positive,
            appReviewDetails?.query_summary?.total_negative,
            appReviewDetails?.query_summary?.total_reviews,
            app.appid
        ];
        try {
            const results = await pool.query(query, values);
            console.log(`Updated ${app.name} review count.`);
        }
        catch (err) {
            throw (err);
        }
    },
    sleep: async function (ms) {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    },
    IsValidDate: function (d) {
        return d instanceof Date && !isNaN(d);
    },
    SanitizeJSON: function (appDetails) {
        //release date can be "coming soon"
        if (appDetails?.data?.release_date?.date != null && !this.IsValidDate(appDetails.data.release_date.date)) {
            appDetails.data.release_date.date = null;
        }
        return appDetails;
    }
}

module.exports = accessData;