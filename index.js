const axios = require('axios');
const { JSDOM } = require("jsdom");
const jQuery = require("jquery");
const buildURL = require("build-url")

const AIRBNB_CLASSES = {
    listing: "_8ssblpx",
    title: "_bzh5lkq",
    link: "_gjfol0",
    price: "_olc9rf0",
}

const AIRBNB_QUERY_URL_NAME = "Vieques--Puerto-Rico"

function airbnbClass(name) {
    return "."+AIRBNB_CLASSES[name]
}

async function scrape() {

    // Initialize an object to store our formatted scrape data
    let scrapeData = {};

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
            if (scrapeData[id] === undefined) { 

                // Increment the number of new listings found, so we know when to stop looking
                newListings = newListings + 1;

                // Add an object containing the data to the scrapeData object using the ID
                scrapeData[id] = {
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
    
    console.log(scrapeData)
}

scrape();
