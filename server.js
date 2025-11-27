require("dotenv").config();
const app = require("./app");
const connectDB = require("./src/config/db");

connectDB();

app.listen(process.env.PORT || 5000, () => {
  console.log(`Server running at port ${process.env.PORT}`);
});

