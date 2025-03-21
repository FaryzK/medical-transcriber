import express from 'express'
import cors from 'cors'
import dotenv from 'dotenv'
import testRoute from './routes/test.route.js'

dotenv.config()

const app = express()
const PORT = process.env.PORT || 3000

// Middleware
app.use(cors())
app.use(express.json())

// Routes
app.use('/api', testRoute)

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`)
})