// ================== CONFIG ==================
require("dotenv").config();
const path = require("path");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");

const app = express();

// ================== MIDDLEWARE ==================
app.use(express.json());
app.use(cors());

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// ================== DATABASE ==================
mongoose
    .connect(process.env.MONGO_URI)
    .then(() => console.log("✅ MongoDB Connected"))
    .catch((err) => console.error("❌ DB Connection Error:", err));

// ================== CLOUDINARY ==================
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const storage = new CloudinaryStorage({
    cloudinary,
    params: {
        folder: "stylestash_uploads",
        allowed_formats: ["jpg", "png", "jpeg", "webp"],
    },
});

const upload = multer({ storage });

// ================== MODELS ==================

// User Schema
const UserSchema = new mongoose.Schema({
    firstName: { type: String, required: true }, 
    lastName: { type: String, required: true },  
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    location: { type: String, default: "New Delhi, India" },
});
const User = mongoose.model("User", UserSchema);

// Item Schema
const ItemSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    imageUrl: { type: String, required: true },
    category: { type: String, required: true },
    subCategory: String,
    seasons: [String],
    color: String,
    warmth: { type: Number, min: 1, max: 10 },
    isClean: { type: Boolean, default: true },
    lastWorn: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
});
const Item = mongoose.model("Item", ItemSchema);

// Outfit Schema
const OutfitSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    date: { type: Date, required: true },
    items: [{ type: mongoose.Schema.Types.ObjectId, ref: "Item" }],
    note: String,
});
const Outfit = mongoose.model("Outfit", OutfitSchema);

// ================== AUTH MIDDLEWARE ==================
const auth = (req, res, next) => {
    const token = req.header("x-auth-token");
    if (!token) return res.status(401).json({ msg: "No token, authorization denied" });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch {
        res.status(400).json({ msg: "Token is not valid" });
    }
};

// ================== AUTH ROUTES ==================
app.post("/api/auth/register", async (req, res) => {
    try {
        const { firstName, lastName, email, password } = req.body;

        if (!firstName || !lastName || !email || !password) {
            return res.status(400).json({ msg: "Please enter all fields" });
        }

        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ msg: "User already exists" });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        user = new User({
            firstName,
            lastName,
            email,
            password: hashedPassword
        });

        await user.save();

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "30d" });
        res.json({ token });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.post("/api/auth/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ msg: "User does not exist" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ msg: "Invalid credentials" });

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "30d" });
        res.json({ token });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ================== DASHBOARD ROUTE ==================
app.get("/api/dashboard/stats", auth, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select("firstName lastName");

        const totalItems = await Item.countDocuments({ userId: req.user.id });
        const dirtyItems = await Item.countDocuments({ userId: req.user.id, isClean: false });
        const isNewUser = totalItems === 0;

        res.json({
            name: `${user.firstName} ${user.lastName}`,
            totalItems,
            dirtyItems,
            isNewUser
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: "Server Error" });
    }
});

// ================== ITEM ROUTES ==================
app.post("/api/items", auth, upload.single("image"), async (req, res) => {
    try {
        const { name, category, subCategory, seasons, color, warmth } = req.body;

        const item = new Item({
            userId: req.user.id,
            name,
            imageUrl: req.file.path,
            category,
            subCategory,
            seasons: seasons ? JSON.parse(seasons) : [],
            color,
            warmth: Number(warmth),
        });

        res.json(await item.save());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get("/api/items", auth, async (req, res) => {
    const items = await Item.find({ userId: req.user.id });
    res.json(items);
});

app.put("/api/items/:id", auth, async (req, res) => {
    try {
        const { name, category, warmth, isClean } = req.body;

        const itemFields = {};
        if (name) itemFields.name = name;
        if (category) itemFields.category = category;
        if (warmth) itemFields.warmth = Number(warmth);
        if (isClean !== undefined) itemFields.isClean = isClean; 

        let item = await Item.findById(req.params.id);
        if (!item) return res.status(404).json({ msg: "Item not found" });

        if (item.userId.toString() !== req.user.id) {
            return res.status(401).json({ msg: "Not authorized to edit this item" });
        }

        item = await Item.findByIdAndUpdate(
            req.params.id,
            { $set: itemFields },
            { new: true } 
        );

        res.json(item);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server Error while updating item" });
    }
});

app.delete("/api/items/:id", auth, async (req, res) => {
    try {
        let item = await Item.findById(req.params.id);
        if (!item) return res.status(404).json({ msg: "Item not found" });

        if (item.userId.toString() !== req.user.id) {
            return res.status(401).json({ msg: "Not authorized to delete this item" });
        }

        await Item.findByIdAndDelete(req.params.id);
        res.json({ msg: "Item deleted successfully" });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Server Error while deleting item" });
    }
});

// ================== OUTFIT ROUTES ==================
app.post("/api/outfits", auth, async (req, res) => {
    try {
        const { items, date, note } = req.body;
        
        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ msg: "Please provide items to save the look" });
        }

        const outfit = new Outfit({
            userId: req.user.id,
            items: items,
            date: date || new Date(),
            note: note || ""
        });

        await outfit.save();

        const populatedOutfit = await Outfit.findById(outfit._id).populate('items');
        res.json(populatedOutfit);
    } catch (err) {
        console.error("Save Outfit Error:", err);
        res.status(500).json({ error: "Server Error while saving outfit" });
    }
});

app.get("/api/outfits", auth, async (req, res) => {
    try {
        const outfits = await Outfit.find({ userId: req.user.id })
            .populate('items')
            .sort({ date: -1 });
            
        res.json(outfits);
    } catch (err) {
        console.error("Get Outfits Error:", err);
        res.status(500).json({ error: "Server Error while fetching outfits" });
    }
});

app.delete("/api/outfits/:id", auth, async (req, res) => {
    try {
        const outfit = await Outfit.findById(req.params.id);
        if (!outfit) return res.status(404).json({ msg: "Outfit not found" });

        if (outfit.userId.toString() !== req.user.id) {
            return res.status(401).json({ msg: "Not authorized to delete this outfit" });
        }

        await Outfit.findByIdAndDelete(req.params.id);
        res.json({ msg: "Outfit deleted successfully" });
    } catch (err) {
        console.error("Delete Outfit Error:", err);
        res.status(500).json({ error: "Server Error while deleting outfit" });
    }
});

// ================== FRONTEND FALLBACK ROUTE ==================
app.get(/.*/, (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ================== SERVER START ==================
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
});
