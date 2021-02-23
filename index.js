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

    // Initialize an array for our formatted scrape data
    let scrapeData = {};

    // Run a while loop to get listings until we decide to break out
    let offset = 0;
    while (true) {

        // Get page of listings from Airbnb
        console.log(`Getting Airbnb results with offset ${offset}...`)
        let response = await axios.get(buildURL("https://www.airbnb.com/", {
            path: `s/${AIRBNB_QUERY_URL_NAME}/homes`,
            queryParams: {
                "search_type": "pagination",
                "items_offset": offset,
            }
        }))
        let html = response.data

        // Make JSDOM instance from HTML, initialize DOM-aware jQuery instance as '$'
        let dom = new JSDOM(html)
        let $ = (jQuery)(dom.window); // From https://medium.com/@asimmittal/using-jquery-nodejs-to-scrape-the-web-9bb5d439413b

        // Get listings, push relevant data into array
        let listings = $.find(airbnbClass("listing"))
        let newListings = 0;
        for (let listing of listings) {

            // Get data from listing
            let idString = $(listing).find(airbnbClass("link")).attr("target")
            let id = idString.replace("listing_", "")
            let title = $(listing).find(airbnbClass("title")).text()
            let price = $(listing).find(airbnbClass("price")).text()

            // Check if listing is already saved
            if (scrapeData[id] === undefined) {
                newListings = newListings + 1;

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
            break;
        }

        // Bump the offset to get the next twenty listings
        offset = offset + 20;
    }
    
    console.log(scrapeData)
}

scrape();
