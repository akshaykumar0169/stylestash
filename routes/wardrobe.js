const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth'); // Your JWT middleware
const Item = require('../models/item');

// @route   POST /api/wardrobe
// @desc    Add new clothing item
router.post('/', auth, async (req, res) => {
    try {
        const { name, category, subCategory, seasons, color, warmth, image } = req.body;

        const newItem = new Item({
            user: req.user.id, // Grabbed from the JWT token
            name,
            category,
            subCategory,
            seasons,
            color,
            warmth,
            image
        });

        const savedItem = await newItem.save();
        res.json(savedItem);

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});