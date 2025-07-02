require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const stripe = require("stripe")(process.env.PAYMENT_GATEWAY_KEY);
const app = express();
const admin = require("firebase-admin");
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

const serviceAccount = require("./firebase-admin-key.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

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
    const trackingCollection = client.db("profastDB").collection("tracking");
    const userCollection = client.db("profastDB").collection("users");
    const riderCollection = client.db("profastDB").collection("riders");

    // middleware
    const verifyFBToken = async (req, res, next) => {
      const authHeader = req.headers.authorization;
      if (!authHeader) {
        return res.status(401).send({ message: "unauthorized access" });
      }
      const token = authHeader.split(" ")[1];
      if (!token) {
        return res.status(401).send({ message: "unauthorized access" });
      }

      // verify token
      try {
        const decoded = await admin.auth().verifyIdToken(token);
        req.decoded = decoded;
        next();
      } catch (error) {
        return res.status(403).send({ message: "forbidden access" });
      }
    };

    // Get parcels by the email
    app.get("/parcels/:email", verifyFBToken, async (req, res) => {
      const email = req.params.email;
      if (req.decoded.email !== email) {
        return res.status(403).send({ message: "forbidden access" });
      }
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

    app.get("/payments", verifyFBToken, async (req, res) => {
      const email = req.query.email;
      if (req.decoded.email !== email) {
        return res.status(403).send({ message: "forbidden access" });
      }
      const query = { email: email };
      const result = await paymentCollection.find(query).toArray();
      res.send(result);
    });

    app.post("/tracking", async (req, res) => {
      const {
        tracking_id,
        parcel_id,
        status,
        message,
        updated_by = "",
      } = req.body;
      const log = {
        tracking_id,
        parcel_id: parcel_id ? new ObjectId(parcel_id) : undefined,
        status,
        message,
        time: new Date(),
        updated_by,
      };
      const result = await trackingCollection.insertOne(log);
      res.send(result);
    });

    // Add parcel
    app.post("/add-parcel", async (req, res) => {
      console.log(req.headers);
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

        const filter = { _id: new ObjectId(parcelId) };
        const updatedDoc = {
          $set: {
            payment_status: "paid",
          },
        };
        const updateResult = await parcelCollection.updateOne(
          filter,
          updatedDoc
        );

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

    // user api

    app.post("/users", async (req, res) => {
      const email = req.body.email;
      const userExists = await userCollection.findOne({ email });
      if (userExists) {
        return res.status(200).send({ message: "user already exists" });
      }
      const user = req.body;
      const result = await userCollection.insertOne(user);
      res.status(201).send(result);
    });

    // rider api
    app.post("/riders", async (req, res) => {
      const newRider = req.body;
      const result = await riderCollection.insertOne(newRider);
      res.status(201).send(result);
    });

    app.get("/pending-rider", async (req, res) => {
      const result = await riderCollection
        .find({ status: "pending" })
        .toArray();
      res.send(result);
    });
    // patch/riders/approve/:id
    app.patch("/riders/approve/:id", async (req, res) => {
      const riderId = req.params.id;
      const query = { _id: new ObjectId(riderId) };
      const updatedDoc = {
        $set: {
          status: "active",
        },
      };

      try {
        const result = await riderCollection.updateOne(query, updatedDoc);

        if (result.modifiedCount > 0) {
          res.send({ success: true, message: "Rider approved." });
        } else {
          res.status(404).send({
            success: false,
            message: "Rider not found or already active.",
          });
        }
      } catch (err) {
        res.status(500).send({
          success: false,
          message: "Server error",
          error: err.message,
        });
      }
    });
    // DELETE /riders/reject/:id
    app.delete("/riders/reject/:id", async (req, res) => {
      const riderId = req.params.id;

      try {
        const result = await riderCollection.deleteOne({
          _id: new ObjectId(riderId),
        });

        if (result.deletedCount > 0) {
          res.send({ success: true, message: "Rider rejected and removed." });
        } else {
          res.status(404).send({ success: false, message: "Rider not found." });
        }
      } catch (err) {
        res
          .status(500)
          .send({
            success: false,
            message: "Server error",
            error: err.message,
          });
      }
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
