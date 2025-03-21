export const testConnection = async (req, res) => {
    try {
        res.json({
            message: "API is working!",
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(500).json({
            message: "Something went wrong",
            error: error.message
        });
    }
}; 