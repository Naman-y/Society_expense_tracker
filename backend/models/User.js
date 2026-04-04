const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
    clerkId: {
        type: String,
        required: true,
        unique: true,
        index: true
    },
    email: {
        type: String,
        default: null
    },
    firstName: {
        type: String,
        default: ""
    },
    lastName: {
        type: String,
        default: ""
    },
    role: {
        type: String,
        enum: ["admin", "secretary", "cashier", "member"],
        default: "member",
        index: true
    },
    flatNumber: {
        type: String,
        default: ""
    },
    flatOwnerName: {
        type: String,
        default: ""
    },
    phoneNumber: {
        type: String,
        default: ""
    },
    secretarySince: {
        type: String,
        default: ""
    },
    roleSince: {
        type: String,
        default: ""
    },
    profileCompleted: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model("User", userSchema);
