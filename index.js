const Axios = require("axios");
const { JSDOM } = require("jsdom");
const jQuery = require("jquery");
const BuildURL = require("build-url");
const fs = require("fs");
const Puppeteer = require("puppeteer");
const Querystring = require('querystring');
const Moment = require("moment");
const Papaparse = require("papaparse");

const AIRBNB_CLASSES = {
    listing: "_8ssblpx",
    title: "_bzh5lkq",
    link: "_mm360j",
    price: "_olc9rf0",
    roomDetails: "_tqmy57",
    roomDetailsTitle: "_xcsyj0",
    reviewsButtonContainer: "_19qg1ru",
    reviewsButton: "_13e0raay",
    overlayReview: "_1gjypya",
    mainPageReview: "_50mnu4",
    reviewDate: "_1ixuu7m",
    roomMap: "_384m8u",
}

const AIRBNB_QUERY_URL_NAME = "Vieques--Puerto-Rico"

function airbnbClass(name) {
    return "."+AIRBNB_CLASSES[name]
}

function sleep(ms) {
    return new Promise((resolve) => {
        setTimeout(resolve, ms)
    })
}

async function processReviewsList(reviews, listing) {
    return new Promise(async (resolve) => {
        let moments = [];
        for (var review of reviews) {
            let dateString = await review.$eval(airbnbClass("reviewDate"), el => el.innerText)
            let dateMoment = Moment(dateString, "MMMM YYYY")
            moments.push(dateMoment.format("X"))
        }
        moments.sort()
        listing.numReviews = reviews.length;
        listing.firstReviewTimestamp = moments[0]
        listing.firstReview = Moment(moments[0], "X").format("MMMM YYYY")
        listing.lastReviewTimestamp = moments[moments.length-1]
        listing.lastReview = Moment(moments[moments.length-1], "X").format("MMMM YYYY")
        resolve()
    })
}

async function scrapeListings(filename) {

    // Initialize an object to store our formatted scrape data
    let listingsMap = {};

    // Run a while loop to get listings until we decide to break out...
    let offset = 0;
    while (true) {
        console.log(`Getting Airbnb results with offset ${offset}...`)

        // Setup an Airbnb URL using the 'build-url' package
        let url = BuildURL("https://www.airbnb.com/", {
            path: `s/${AIRBNB_QUERY_URL_NAME}/homes`,
            queryParams: {
                "search_type": "pagination",
                "items_offset": offset,
            }
        })

        // Get page of listings from Airbnb
        let response = await Axios.get(url)
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

    console.log(`Scraped a total of ${Object.keys(listingsMap).length} listings!`)

    fs.writeFileSync(filename, JSON.stringify(listingsMap, null, 2))
}

async function scrapeListingData(filename) {

    // Initialize a Puppeteer instance
    const browser = await Puppeteer.launch()

    // Read from file
    let listingsMap = JSON.parse(fs.readFileSync(filename, 'utf8'))
    let listingKeys = Object.keys(listingsMap)

    // Iterate through listings...
    for (let i in listingKeys) {
        let id = listingKeys[i]

        // Don't scrape individual listing if already complete
        if (listingsMap[id].complete) {
            continue
        }

        console.log("========================================")
        console.log(`Handling listing ${id} (${i} of ${listingKeys.length})...`)

        // Setup a Puppeteer page for an individual listing, load page
        console.log("Load page...")
        const page = await browser.newPage();
        await page.goto(`https://www.airbnb.com/rooms/${id}`);

        // Wait for details, scrape details
        console.log("Save details...")
        try {
            await page.waitForSelector(airbnbClass("roomDetails"), { timeout: 5000 })
            let detailsText = await page.$eval(airbnbClass("roomDetails"), el => el.textContent)
            let detailsTitleText = await page.$eval(airbnbClass("roomDetailsTitle"), el => el.textContent)
            let detailsTitleComponents = detailsTitleText.split("hosted by")
            listingsMap[id].type = detailsTitleComponents[0].trim()
            listingsMap[id].host = detailsTitleComponents[1].trim()
            let remainingDetailsText = detailsText.replace(detailsTitleText, '')
            let remainingDetailsArray = remainingDetailsText.split(" · ")
            for (let detail of remainingDetailsArray) {
                let detailAmount = detail.split(" ")[0]
                if (detail.includes("guest")) {
                    listingsMap[id].guests = detailAmount
                } else if (detail.includes("bedroom")) {
                    listingsMap[id].bedrooms = detailAmount
                } else if (detail.includes("bed")) {
                    listingsMap[id].beds = detailAmount
                } else if (detail.includes("bath")) {
                    listingsMap[id].baths = detailAmount
                }
            }
        } catch (err) {
            console.log("Could not find room details!")
        }

        // Scroll to map, trigger MapsQuery request, grab URL, parse out center from bounds
        console.log("Save approximate location...")
        try {
            await page.waitForSelector(airbnbClass("roomMap"), { timeout: 5000 })
            await page.$eval(airbnbClass("roomMap"), el => el.scrollIntoViewIfNeeded())
            await page.waitForRequest(req => {
                if (req.url().includes("MapsQuery")) {

                    // Get URL from request
                    let url = req.url()

                    // Parse out query parameters
                    let urlComps = url.split("?")
                    let urlQuery = urlComps[1] // Get 2nd element
                    let query = Querystring.parse(urlQuery)
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

                    listingsMap[id].lat = lat
                    listingsMap[id].lng = lng

                    return true
                }
            })
        } catch (err) {
            console.log("Could not find location details!")
        }

        console.log("Save reviews metadata...")
        let savedReviews = [];
        try {
            // Look for "Show all reviews" button, click it
            await page.waitForSelector(airbnbClass("reviewsButtonContainer"), { timeout: 5000 })
            await page.click(`${airbnbClass("reviewsButtonContainer")} ${airbnbClass("reviewsButton")}`)

            // Get all reviews from overlay by scrolling down until exhausted
            console.log("Loading paged reviews...")
            await page.waitForSelector(airbnbClass("overlayReview"))
            await new Promise(async (resolve) => {
                let reviewsCount = 0
                while (true) {

                    // Set count to number of reviews at start of iteration
                    reviewsCount = savedReviews.length

                    // Save reviews in overlay
                    await page.$$(airbnbClass("overlayReview")).then(reviews => {
                        savedReviews = reviews
                        return true
                    })

                    // Scroll down to the bottom of the reviews page
                    await page.$$eval(airbnbClass("overlayReview"), reviews => {
                        reviews[reviews.length - 1].scrollIntoView()
                        return true
                    })

                    // Wait half a second
                    await sleep(500)

                    // If there are more reviews than there were, keep iterating
                    if (savedReviews.length == reviewsCount) {
                        break
                    }

                    console.log(`Scrolled to ${savedReviews.length} reviews...`)
                }
                resolve();
            })
        } catch (err) {
            // If "Show all reviews" button not found...

            // Look for reviews on listing page
            try {
                await page.waitForSelector(airbnbClass("mainPageReview"), { timeout: 5000 })
                console.log("Scraping reviews from listing page...")
                await page.$$(airbnbClass("mainPageReview")).then(reviews => {
                    console.log(reviews)
                    savedReviews = reviews
                    return true
                })
            } catch (err) {
                console.log("No reviews found")
            }
        }
        if (savedReviews.length > 0) {
            await processReviewsList(savedReviews, listingsMap[id])
        }
        
        // Mark listing as complete
        listingsMap[id].complete = true;

        // Write data to file before iterating
        fs.writeFileSync(filename, JSON.stringify(listingsMap, null, 2))
        
        page.close()
    }

    browser.close()
}

async function exportListingData(filename) {

    // Read from file
    let listingsMap = JSON.parse(fs.readFileSync(filename, 'utf8'))
    let listingKeys = Object.keys(listingsMap)
    let listingsArray = []

    // Push objects into array
    for (var key of listingKeys) {
        listingsMap[key].url = `https://www.airbnb.com/rooms/${key}`
        listingsArray.push(listingsMap[key])
    }

    let csvString = Papaparse.unparse(listingsArray, {
        columns: [
            "title", "price", "lat", "lng", "type", "host", "guests", "bedrooms", "beds", "baths", "numReviews",
            "firstReview", "firstReviewTimestamp", "lastReview", "lastReviewTimestamp", "url"
        ]
    })
    
    // Save to file
    let csvFilename = filename.replace(".json", ".csv")
    fs.writeFileSync(csvFilename, csvString)
}

async function run() {

    var args = process.argv.slice(2);
    let filename = args[0]
    let listingsAlreadyScraped = args[1] === "true"

    if (filename === undefined) {
        throw("You must provide a filename")
    }

    if (!listingsAlreadyScraped) {
        await scrapeListings(filename);
    }
    scrapeListingData(filename);
    exportListingData(filename);
}

run()
