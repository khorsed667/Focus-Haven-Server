const express = require("express");
const cors = require("cors");
const SSLCommerzPayment = require("sslcommerz-lts");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 5000;

//middleware:
app.use(cors());
app.use(express.json());

//mongoDB functon

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
console.log(process.env.DB_USER);
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hlokssy.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    await client.connect();

    // Database collection
    const ClassCollection = client.db("FocusHaven").collection("Classes");
    const CommentsCollection = client.db("FocusHaven").collection("Comments");
    const PaymentsCollection = client.db("FocusHaven").collection("Payments");
    const UsersCollection = client.db("FocusHaven").collection("Users");
    const InstractorsCollection = client
      .db("FocusHaven")
      .collection("Instractors");

    //Function for call all the data collection from database
    const collectionHandler = (collectionName) => {
      return async (req, res) => {
        const collectedData = await collectionName.find().toArray();
        res.send(collectedData);
      };
    };

    app.get("/classes", collectionHandler(ClassCollection));
    app.get("/comments", collectionHandler(CommentsCollection));
    app.get("/instractors", collectionHandler(InstractorsCollection));
    app.get("/payments", collectionHandler(PaymentsCollection));
    app.get("/users", collectionHandler(UsersCollection));

    app.post("/user", async (req, res) => {
      const user = req.body;
      const query = { email: user.email };
      const existingUser = await UsersCollection.findOne(query);
      if (existingUser) {
        res.send({ message: "This User is alreay exist" });
      }
      const result = await UsersCollection.insertOne(user);
      res.send(result);
    });

    app.patch("/users/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateRole = { $set: req.body };
      const result = await UsersCollection.updateOne(filter, updateRole);
      res.send(result);
    });

    app.get("/classes/:id", async (req, res) => {
      const id = req.params.id;
      const result = await ClassCollection.findOne({_id : new ObjectId(id)});
      res.send(result);
    });

    app.patch("/classes/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updateRole = { $set: req.body };
      const result = await ClassCollection.updateOne(filter, updateRole);
      res.send(result);
    });

    app.delete("/classes/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      console.log(filter, id);
      const result = await ClassCollection.deleteOne(filter);
      res.send(result);
    });

    app.post("/addClasses", async (req, res) => {
      const addedClass = req.body;
      const result = await ClassCollection.insertOne(addedClass);
      res.send(result);
    });

    // SSLCOMMERZ api integration:
    const store_id = `${process.env.DB_STORE_ID}`;
    const store_passwd = `${process.env.DB_STORE_PASS}`;
    const is_live = false; //true for live, false for sandbox

    app.post("/enroll", async (req, res) => {
      const trans_id = new ObjectId().toString();
      const data = {
        total_amount: req.body.price,
        currency: "USD",
        tran_id: trans_id,
        success_url: `https://focus-haven-server.onrender.com/payment/success/${trans_id}`,
        fail_url: `https://focus-haven-server.onrender.com/payment/fail/${trans_id}`,
        cancel_url: "http://localhost:3030/cancel",
        ipn_url: "http://localhost:3030/ipn",
        product_profile: "className", // Adjust this field as per your requirement
        product_name: req.body.className,
        product_category: "Education",
        cus_phone: "01999999999",
        shipping_method: "NO",
        cus_name: req.body.studentGmail,
        cus_email: req.body.studentGmail,
      };
      const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live);
      sslcz.init(data).then((apiResponse) => {
        // Redirect the user to payment gateway
        let GatewayPageURL = apiResponse.GatewayPageURL;
        res.send({ url: GatewayPageURL });
        const pandingEnrollment = {
          className: req.body.className,
          classId: req.body.classId,
          paymentStatus: "Pending",
          StudenEmail: req.body.studentGmail,
          InstractorEmail: req.body.InstractorEmail,
          transectionId: trans_id,
          amount: req.body.price,
        };
        const result = PaymentsCollection.insertOne(pandingEnrollment);
      });
      app.post("/payment/success/:trans_id", async (req, res) => {
        const enrollment = await PaymentsCollection.findOne({
          transectionId: req.params.trans_id,
        });
        if (!enrollment) {
          res.send(404).send("Enrollment not found");
        }
        const result = await PaymentsCollection.updateOne(
          {
            transectionId: req.params.trans_id,
          },
          {
            $set: { paymentStatus: "Paid" },
          }
        );
        if (result.modifiedCount > 0) {
          const classUpdateResult = await ClassCollection.updateOne(
            { className: enrollment.className },
            { $inc: { availableSeats: -1 } }
          );

          const enrolledStudent = await ClassCollection.updateOne(
            { className: enrollment.className },
            { $inc: { enrolledStudents: +1 } }
          )

          if (classUpdateResult.modifiedCount && enrolledStudent.modifiedCount > 0) {
            res.redirect(
              `https://focus-haven-1.onrender.com/payment/success/${req.params.trans_id}`
            );
          }
        }
      });
      app.post("/payment/fail/:trans_id", async (req, res) => {
        const result = await PaymentsCollection.deleteOne({
          transectionId: req.params.trans_id,
        });
        if (result.deletedCount > 0) {
          res.redirect(`https://focus-haven-1.onrender.com/payment/fail`);
        }
      });
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

app.get("/", (req, res) => {
  res.send("Wealcome to your dreaming Haven!");
});

app.listen(port, () => {
  console.log(`Haven is building on ${port}`);
});
