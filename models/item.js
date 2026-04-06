const mongoose = require('mongoose');

const ItemSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    category: { type: String, required: true }, // top, bottom, shoes, outerwear
    subCategory: { type: String },
    seasons: [{ type: String }],
    color: { type: String },
    warmth: { type: Number, required: true, min: 1, max: 10 },
    image: { type: String, required: true }, // URL or Base64 string
    
    // 👇 ADDED: This tracks if the item is in the wardrobe (true) or laundry (false)
    isClean: { 
        type: Boolean, 
        default: true 
    },

    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Item', ItemSchema);
