// server.js

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

mongoose.connect('mongodb://localhost:27017/tinywiki', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const searchSchema = new mongoose.Schema({
  keyword: String,
});

const Search = mongoose.model('Search', searchSchema);

const wikipediaApiUrl = 'https://en.wikipedia.org/w/api.php';

app.post('/login', (req, res) => {
  const { username, password } = req.body;

  const adminUsername = 'admin';
  const adminPassword = 'adminpassword';

  if (username === adminUsername && password === adminPassword) {
    const token = jwt.sign({ user: username, role: 'admin' }, 'secretkey', { expiresIn: '1h' });
    res.json({ token });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

const authenticateAdmin = (req, res, next) => {
  const token = req.headers.authorization;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  jwt.verify(token, 'secretkey', (err, decoded) => {
    if (err || decoded.role !== 'admin') {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    req.user = decoded.user;
    next();
  });
};

app.get('/search/:searchTerm', async (req, res) => {
  const searchTerm = req.params.searchTerm;

  try {
    const response = await axios.get(wikipediaApiUrl, {
      params: {
        action: 'query',
        list: 'search',
        srsearch: searchTerm,
        format: 'json',
      },
    });

    const searchRecord = new Search({ keyword: searchTerm });
    await searchRecord.save();

    res.json(response.data.query.search);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/read/:slug', async (req, res) => {
  const slug = req.params.slug;

  try {
    const response = await axios.get(wikipediaApiUrl, {
      params: {
        action: 'query',
        prop: 'revisions',
        rvprop: 'content',
        titles: slug,
        format: 'json',
      },
    });

    const page = response.data.query.pages[Object.keys(response.data.query.pages)[0]];

    res.json({ title: page.title, html: page.revisions[0]['*'] });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.get('/analytics/:order', authenticateAdmin, async (req, res) => {
  const order = req.params.order === 'asc' ? 1 : -1;

  try {
    const mostSearchedKeywords = await Search.aggregate([
      { $group: { _id: '$keyword', count: { $sum: 1 } } },
      { $sort: { count: order } },
      { $project: { _id: 0, keyword: '$_id', count: 1 } },
    ]);

    res.json(mostSearchedKeywords);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
