const { Router } = require("express");
const db = require("../db/database");

const router = Router();


// SHOW LOGIN PAGE
router.get("/login", (req, res) => {
    res.render("auth/login");
});


// SHOW REGISTER PAGE
router.get("/register", (req, res) => {
    res.render("auth/register");
});


// LOGIN
router.post("/login", (req, res) => {

    const { email, password } = req.body;

    const user = db.prepare(
        "SELECT * FROM users WHERE email = ? AND password = ?"
    ).get(email, password);

    if (user) {

        req.session.admin = {
            id: user.user_id,
            email: user.email
        };

        res.json({
            success: true
        });

    } else {

        res.status(401).json({
            success: false,
            message: "Login denied"
        });
    }
});


// REGISTER
router.post("/register", (req, res) => {

    const { email, password } = req.body;

    try {

        db.prepare(
            "INSERT INTO users (email, password) VALUES (?, ?)"
        ).run(email, password);

        res.json({
            success: true
        });

    } catch (error) {

        res.status(400).json({
            success: false,
            message: "Account could not be created"
        });
    }
});

router.get("/logout", (req, res) => {

    req.session.destroy(() => {
        res.redirect("/auth/login");
    });

});


module.exports = router;