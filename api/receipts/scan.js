const vision = require("@google-cloud/vision");

module.exports = async function (req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const { image } = req.body; // base64 image

    if (!image) {
      return res.status(400).json({ error: "No image provided" });
    }

    // Initialize client
    const client = new vision.ImageAnnotatorClient();

    // Strip "data:image..."
    const base64Data = image.split(",")[1];

    const [result] = await client.documentTextDetection({
      image: { content: base64Data }
    });

    const text = result.fullTextAnnotation?.text || "";

    return res.json({
      success: true,
      text
    });

  } catch (err) {
    console.error("Vision OCR Error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};
