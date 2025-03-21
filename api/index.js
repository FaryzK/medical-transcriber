import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import fileUpload from 'express-fileupload'
import testRoute from './routes/test.route.js'
import transcribeRoute from './routes/transcribe.route.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())
app.use(fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max file size
    useTempFiles: false,
    debug: true
}))

// Routes
app.use('/api', testRoute)
app.use('/api', transcribeRoute)

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})