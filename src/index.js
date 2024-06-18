import "dotenv/config";
import connectDB from "./db/index.js";
import { app } from "./app.js";

const port = process.env.PORT || 8000;

connectDB()
.then(() => {
    app.on('error', (err) => {
        console.error(`Express error while connecting MongoDB!!!, `, err);
        process.exit(1);
    })
    app.listen(port, () => {
        console.log(`Server is running at port: ${port}`);
    } )
})
.catch((err) => {
    console.error("MongoDB connection failed!!! ", err);
    process.exit(1);
})

// import express from "express";
// const app = express();

// (async function connectDB() {
//     try {
//         await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`);

//         app.on("error", (error) => {
//             console.log("Error: ", error);
//             throw error;
//         } )
//         app.listen(process.env.PORT, () => {
//             console.log(`Server is running at port ${process.env.PORT}`);
//         })
//     } catch(error) {
//         console.error("ERROR: ",error);
//         throw error
//     }
// })();