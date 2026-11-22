import express from 'express'
import cors from 'cors'
import { MongoClient } from 'mongodb';
import 'dotenv/config'
const app = express()
const port = process.env.PORT || 5000;


const client = new MongoClient(`mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.q6px8ox.mongodb.net/`);

app.use(cors())
app.use(express.json())

app.get('/', (req, res) => {
  res.send('Server is Running!');
});

console.log(process.env.DB_USER)


export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

await connectToMongoDB();


app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});