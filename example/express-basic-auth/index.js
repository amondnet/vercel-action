const express = require("express");
const basicAuth = require("express-basic-auth");

const app = express();

app.use(
  basicAuth({
    users: {
      user: "pass"
    },
    challenge: true
  })
);
app.use(express.static(__dirname + '/_static'));

app.listen(4444, () => console.log('Listening on port 4444...'));
