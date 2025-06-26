require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.cvlwqch.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});


async function run() {
  try {
    const parcelCollection = client.db("profastDB").collection("parcels");

    // Get all parcels
    app.get("/parcels/:email", async (req, res) => {
      const email = req.params.email;
      let query = {}
      if(email){
        query = {created_by:email}
      }
      const result = await parcelCollection.find(query).sort({creation_date: -1}).toArray();
      res.send(result);
    });

    // Add parcel
    app.post("/add-parcel", async (req, res) => {
      try {
        const data = req.body;
        const weight = req.body.weight;
        data.weight = parseFloat(weight);
        const result = await parcelCollection.insertOne(data);
        res.status(201).send(result);
      } catch (error) {
        res.status(500).send({ error: "Failed to add parcel" });
      }
    });

    // remove parcel 
    app.delete('/remove/:id', async (req,res)=> {
      const id = req.params.id
      const query = {_id: new ObjectId(id)}
      const result = await parcelCollection.deleteOne(query);
      res.send(result)
    })

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

// Sample route
app.get("/", (req, res) => {
  res.send("Profast Server Running");
});

// Start server
app.listen(port, () => {
  console.log(`🚀 Profast server running on port ${port}`);
});
