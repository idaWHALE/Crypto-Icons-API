const express = require('express');
const app = express();
const { convert } = require('convert-svg-to-png');
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const { document } = (new JSDOM('')).window;
const fs = require('fs');
const path = require('path');
const debug = true;
const hitCountKey = 'apiHitCount';
app.use(express.static(__dirname + '/public'));

// GET Home page
app.get('/', function(req, res) {
  res.sendFile('index.html');
});

// GET png
app.get('/api/:style/:currency/:size/:color?', async(req, res) => {
  // Params
  const style = req.params.style;
  const currency = req.params.currency;
  const size = req.params.size;
  const cacheKey = req.path;
  const filename = currency + '-' + style + '-' + size + '.png';

  // 0 <= Valid size <= 1000
  if (size <= 0 || size >= 1000) {
    res.status(400).send({'error' : 'Invalid size'});
    return
  }

  // Redis
  var redisRetryStrategy = function(options) {
    if (options.error.code === 'ECONNREFUSED') {

    }
  };

  const redisURL = process.env.REDIS_URL || 'http://127.0.0.1:6379';
  var client = require('redis').createClient({
    url : process.env.REDIS_URL,
    return_buffers : true
  });

  client.on('error', function (err) {
    client.quit();
    generatePNG(req, res, null)
  });

  client.on('connect', function (err) {
    // Check cache
    client.get(cacheKey, async(error, result) => {
      if (result == null) {
        console.log("Cache miss");
        generatePNG(req, res, client)
      } else {
        client.quit();
        console.log("Cache hit");
        sendPNG(res, result, filename)
      }
    })
  })
});

// Functions

function sendPNG(response, png, filename) {
  response.set('Content-Type', 'image/png');
  response.header('Content-disposition', 'inline; filename=' + filename);
  response.send(png)
}

async function generatePNG(req, res, redis) {
  // Params
  const style = req.params.style;
  const currency = req.params.currency;
  const size = req.params.size;
  const color = req.params.color;
  const cacheKey = req.path;
  const filename = currency + '-' + style + '-' + size + '.png';

  // SVG file path
  if (debug) console.log('1');
  const svgPath = path.join(__dirname, 'public', 'cryptocurrency-icons', 'svg', style, currency + '.svg');
  console.log('svgPath: ', svgPath);

  // Check if file exists
  if (debug) console.log('2');
  if (!fs.existsSync(svgPath)) {
    res.status(404).send(null);
    return
  }

  if (debug) console.log('3');
  const svg = fs.readFileSync(svgPath, 'utf8');
  const element = document.createElement('div');
  element.innerHTML = svg;

  if (debug) console.log('4');
  const svgElement = element.getElementsByTagName("svg")[0];

  // Define the circles
  const colorCircle = element.getElementsByTagName("circle")[0];
  const iconCircle = element.getElementsByTagName("use")[1];

  if (debug) console.log('5');
  // Set viewBox so SVG resizes correctly
  const originalSize = svgElement.getAttribute('width');
  svgElement.setAttribute('viewBox', '0 0 ' + originalSize + ' ' + originalSize);

  // Set requested size
  svgElement.setAttribute('width', size);
  svgElement.setAttribute('height', size);

  if (debug) console.log('6');
  // Set circle color, if `color` or `icon`
  if (color != null && style == 'color') {
    const colorString = '#' + color;
    colorCircle.setAttribute('fill', colorString)
  } else if (color != null && style == 'icon') {
    const colorString = '#' + color;
    iconCircle.setAttribute('fill', colorString)
  }

  if (debug) console.log('7');
  // Convert to PNG
  const png = await convert(element.innerHTML, {
    'height' : size,
    'width' : size,
    'puppeteer' : {'args' : ['--no-sandbox', '--disable-setuid-sandbox']}
  });

  // Save to redis
  if (redis != null) {
    redis.set(cacheKey, png, function(err) {
      redis.quit()
    });
    redis.incr(hitCountKey);
  }

  // Return response
  sendPNG(res, png, filename)
}

// Listen
var port = process.env.PORT || 3000;
app.listen(port, () => console.log('Our app is running on http://localhost:' + port));
