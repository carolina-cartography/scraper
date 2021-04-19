const axios = require("axios");
const { JSDOM } = require("jsdom");
const jQuery = require("jquery");
const buildURL = require("build-url");
const fs = require("fs");
const puppeteer = require("puppeteer");
const querystring = require('querystring');

const AIRBNB_CLASSES = {
    listing: "_8ssblpx",
    title: "_bzh5lkq",
    link: "_mm360j",
    price: "_olc9rf0",
    roomDetails: "_tqmy57",
    roomDetailsTitle: "_xcsyj0",
    reviewsButton: "_13e0raay",
    roomMap: "_384m8u",
}

const AIRBNB_QUERY_URL_NAME = "Vieques--Puerto-Rico"

function airbnbClass(name) {
    return "."+AIRBNB_CLASSES[name]
}

async function scrapeListings(filename) {

    // Initialize an object to store our formatted scrape data
    let listingsMap = {};

    // Run a while loop to get listings until we decide to break out...
    let offset = 0;
    while (true) {
        console.log(`Getting Airbnb results with offset ${offset}...`)

        // Setup an Airbnb URL using the 'build-url' package
        let url = buildURL("https://www.airbnb.com/", {
            path: `s/${AIRBNB_QUERY_URL_NAME}/homes`,
            queryParams: {
                "search_type": "pagination",
                "items_offset": offset,
            }
        })

        // Get page of listings from Airbnb
        let response = await axios.get(url)
        let html = response.data

        // Make JSDOM instance from HTML, initialize DOM-aware jQuery instance as '$'
        let dom = new JSDOM(html)
        let $ = (jQuery)(dom.window); // From https://medium.com/@asimmittal/using-jquery-nodejs-to-scrape-the-web-9bb5d439413b

        // Get listing elements
        let listings = $.find(airbnbClass("listing"))

        // For each listing element...
        let newListings = 0;
        for (let listing of listings) {

            // Get the listing ID, found in the "target" attribute of the listing link
            let idString = $(listing).find(airbnbClass("link")).attr("target")
            let id = idString.replace("listing_", "")

            // Get data
            let title = $(listing).find(airbnbClass("title")).text()
            let price = $(listing).find(airbnbClass("price")).text()

            // Instead of using an array to store listing data, we'll use an object
            // An object in JS is a "key/value pair", like so: {key: "value"}
            // If we store listings in an object where their "key" is their "id", 
            // we can avoid adding the same listing twice

            // Check that we don't already have a key for ID in the scrape data...
            if (listingsMap[id] === undefined) { 

                // Increment the number of new listings found, so we know when to stop looking
                newListings = newListings + 1;

                // Add an object containing the data to the listingsMap object using the ID
                listingsMap[id] = {
                    title: title,
                    price: price,
                }
            }
        }

        // Decide whether to get the next page
        if (newListings > 0) {
            console.log(`Found ${newListings} new listings!`)
        } else {
            break; // If there are no new listings, stop looking (break out of the while loop)
        }

        // Bump the offset to get the next twenty listings
        offset = offset + 20;
    }

    fs.writeFileSync(filename, JSON.stringify(listingsMap, null, 2))
}

async function scrapeListingData(filename) {

    // Initialize a Puppeteer instance
    const browser = await puppeteer.launch()

    // Read from file
    let listingsMap = JSON.parse(fs.readFileSync(filename, 'utf8'))
    let listingKeys = Object.keys(listingsMap)

    // Iterate through listings...
    for (let id of listingKeys) {

        // Don't scrape individual listing if already scraped
        if (listingsMap[id].scraped) {
            continue
        }

        console.log(`Handling listing ${id}...`)

        // Setup a Puppeteer page for an individual listing, load page
        const page = await browser.newPage();
        await page.goto(`https://www.airbnb.com/rooms/${id}`);

        // Wait for details, scrape details
        let details = {};
        await page.waitForSelector(airbnbClass("roomDetails"))
        let detailsText = await page.$eval(airbnbClass("roomDetails"), el => el.textContent)
        let detailsTitleText = await page.$eval(airbnbClass("roomDetailsTitle"), el => el.textContent)
        details.title = detailsTitleText
        let remainingDetailsText = detailsText.replace(detailsTitleText, '')
        let remainingDetailsArray = remainingDetailsText.split(" · ")
        for (let detail of remainingDetailsArray) {
            let detailAmount = detail.split(" ")[0]
            if (detail.includes("guest")) {
                details.guests = detailAmount
            } else if (detail.includes("bedroom")) {
                details.bedrooms = detailAmount
            } else if (detail.includes("bed")) {
                details.beds = detailAmount
            } else if (detail.includes("bath")) {
                details.baths = detailAmount
            }
        }
        listingsMap[id].details = details

        // Scroll to map, trigger MapsQuery request, grab URL, parse out center from bounds
        await page.waitForSelector(airbnbClass("roomMap"))
        await page.$eval(airbnbClass("roomMap"), el => el.scrollIntoViewIfNeeded())
        await page.waitForRequest(req => {
            if (req.url().includes("MapsQuery")) {

                // Get URL from request
                let url = req.url()

                // Parse out query parameters
                let urlComps = url.split("?")
                let urlQuery = urlComps[1] // Get 2nd element
                let query = querystring.parse(urlQuery)
                let vars = JSON.parse(query.variables)

                // Parse out bounds
                let boundingBox = vars.request.locationBounds.boundingBox
                let swLat = boundingBox.southwest.lat
                let swLng = boundingBox.southwest.lng
                let neLat = boundingBox.northeast.lat
                let neLng = boundingBox.northeast.lng
                
                // Calculate center
                let lat = swLat + ((neLat - swLat) / 2)
                let lng = swLng + ((neLng - swLng) / 2)

                listingsMap[id].location = {
                    lat, lng,
                }

                return true
            }
        })

        listingsMap[id].scraped = true;

        // Write data to file before iterating
        fs.writeFileSync(filename, JSON.stringify(listingsMap, null, 2))
        
        page.close()
    }

    browser.close()
}

async function run() {

    var args = process.argv.slice(2);
    let filename = args[0]
    let listingsAlreadyScraped = args[1] === "true"

    if (!listingsAlreadyScraped) {
        await scrapeListings(filename);
    }
    scrapeListingData(filename);
}

run()
