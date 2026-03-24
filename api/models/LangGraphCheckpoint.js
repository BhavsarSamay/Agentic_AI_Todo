const mongoose = require("mongoose");

const CHECKPOINT_COLLECTION_NAME = "langgraph_checkpoints";

const langGraphCheckpointSchema = new mongoose.Schema(
  {
    user_id: {
      type: String,
      required: [true, "User ID is required"],
      trim: true,
    },
    thread_id: {
      type: String,
      required: [true, "Thread ID is required"],
      trim: true,
    },
    checkpoint_ns: {
      type: String,
      default: "",
      trim: true,
    },
    checkpoint_id: {
      type: String,
      required: [true, "Checkpoint ID is required"],
      trim: true,
    },
    parent_checkpoint_id: {
      type: String,
      default: null,
      trim: true,
    },
    checkpoint: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, "Checkpoint payload is required"],
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    pending_writes: {
      type: [
        {
          write_key: {
            type: String,
            required: true,
            trim: true,
          },
          task_id: {
            type: String,
            required: true,
            trim: true,
          },
          channel: {
            type: String,
            required: true,
            trim: true,
          },
          value: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
          },
        },
      ],
      default: [],
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
    },
  },
  {
    timestamps: true,
    collection: CHECKPOINT_COLLECTION_NAME,
  }
);

langGraphCheckpointSchema.index({ user_id: 1 });
langGraphCheckpointSchema.index({ user_id: 1, thread_id: 1 });
langGraphCheckpointSchema.index(
  { user_id: 1, thread_id: 1, checkpoint_ns: 1, checkpoint_id: 1 },
  { unique: true }
);
langGraphCheckpointSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

const LangGraphCheckpoint =
  mongoose.models.LangGraphCheckpoint
  || mongoose.model("LangGraphCheckpoint", langGraphCheckpointSchema);

module.exports = LangGraphCheckpoint;
