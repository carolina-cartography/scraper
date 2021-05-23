# Scraper

An open-source web scraper CLI.
## Getting Started

Carolina Cartography's web scraper is in the inital stages of development. You'll need to setup the repository manually to use the scraper.

1. Clone the repo and navigate to it
2. Run `npm install`

## Scrapers

The CLI supports scraping for the following websites:

### Airbnb

Scrape Airbnb listings with just a URL parameter from your Airbnb query.

Note: _Airbnb updates its CSS class names regularly, which can break the script. Users will need to manually update class names on an ongoing basis._

**CLI Description**
```
index.js airbnb

Produces JSON and CSV data for an Airbnb query

Options:
  --version   Show version number                                      [boolean]
  --help      Show help                                                [boolean]
  --query     The URL-encoded place identifier of your Airbnb query, like
              'location' in 'https://airbnb.com/s/location/homes'
                                                             [string] [required]
  --filename  The filename used to save JSON and CSV data for your scrape. Do
              not include an extension.                      [string] [required]
  --reset     Tells the scraper to start from the beginning instead of
              attempting to pick up where it left off.                 [boolean]
```

**Example command:**
```
node index.js airbnb --query Vieques--Puerto-Rico --filename vieques
```

**Example output:**  

vieques.json
```json
{
  "22669": {
    "title": "Casa Esperanza-Minutes to the Beach",
    "price": "$121",
    "type": "Entire house",
    "host": "Michelle",
    "guests": "8",
    "bedrooms": "2",
    "beds": "4",
    "baths": "2",
    "lat": 18.099698906505935,
    "lng": -65.47523000000001,
    "numReviews": 42,
    "firstReviewTimestamp": "1435723200",
    "firstReview": "July 2015",
    "lastReviewTimestamp": "1617249600",
    "lastReview": "April 2021",
    "complete": true
  },
  "157223": {
    "title": "Gaviota...what a view! Comfort!....",
    "price": "$99",
    "type": "Entire apartment",
    "guests": "6",
    "bedrooms": "2",
    "beds": "2",
    "baths": "1",
    "lat": 18.135188904655838,
    "lng": -65.43303000000003,
    "numReviews": 88,
    "firstReviewTimestamp": "1333252800",
    "firstReview": "April 2012",
    "lastReviewTimestamp": "1617249600",
    "lastReview": "April 2021",
    "complete": true,
    "host": "Waldo (José)"
  }
}
```

vieques.csv  
```
title,price,lat,lng,type,host,guests,bedrooms,beds,baths,numReviews,firstReview,firstReviewTimestamp,lastReview,lastReviewTimestamp,url
Casa Esperanza-Minutes to the Beach,$121,18.099698906505935,-65.47523000000001,Entire house,Michelle,8,2,4,2,42,July 2015,1435723200,April 2021,1617249600,https://www.airbnb.com/rooms/22669
Gaviota...what a view! Comfort!....,$99,18.135188904655838,-65.43303000000003,Entire apartment,Waldo (José),6,2,2,1,88,April 2012,1333252800,April 2021,1617249600,https://www.airbnb.com/rooms/157223
```