require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.PAYMENT_GATEWAY_KEY);
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
    const paymentCollection = client.db("profastDB").collection("payments");

    // Get  parcels by the email
    app.get("/parcels/:email", async (req, res) => {
      const email = req.params.email;
      let query = { created_by: email };
      const result = await parcelCollection
        .find(query)
        .sort({ creation_date: -1 })
        .toArray();
      res.send(result);
    });

    // get a single parcel
    app.get("/parcel/:id", async (req, res) => {
      const id = req.params.id;
      console.log(id);
      const query = { _id: new ObjectId(id) };
      const result = await parcelCollection.findOne(query);
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

    app.post("/create-payment-intent", async (req, res) => {
      const amount = req.body.amountInCents;
      try {
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });
        res.json({ clientSecret: paymentIntent.client_secret });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });

    // payment history
    app.post("/payments", async (req, res) => {
      try {
        const { parcelId, email, paymentMethod, amount, transactionId } =
          req.body;
          
      const filter = {_id:new ObjectId(parcelId)}
      const updatedDoc = {
        $set: {
          payment_status: 'paid'
        }
      }
      const updateResult = await parcelCollection.updateOne(filter,updatedDoc)
      
      // if(updateResult.modifiedCount === 0){
      //   return res.status(404).send({message: 'parcel not found or already paid'})
      // }
      

        // Insert new payment
        const newPayment = {
          email,
          parcelId,
          amount,
          transactionId,
          paymentMethod,
          paid_at: new Date(),
          paid_at_string: new Date().toISOString(),
        };
        const result = await paymentCollection.insertOne(newPayment);
        return res
          .status(201)
          .json({ message: "Payment saved", insertedId: result.insertedId });
      } catch (err) {
        res
          .status(500)
          .json({ error: "Operation failed", details: err.message });
      }
    });

    // remove parcel
    app.delete("/remove/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await parcelCollection.deleteOne(query);
      res.send(result);
    });

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
