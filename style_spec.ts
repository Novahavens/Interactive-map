/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
export const STYLE_SPEC = `# **JSON style reference for Cloud-based maps styling**

The JSON schema for cloud-based maps styling lets you use JSON to customize maps just as you would through the style editor interface. 

## **Examples**

The following JSON style declaration sets a background color, and then defines styles for points of interest, parks, water features, and hides labels for food and drink locations.

\`\`\`json
{
  "variant": "light",
  "styles": [
    {
      "id": "infrastructure.roadNetwork.road.highway",
      "geometry": {
        "fillColor": "#c58aff",
        "strokeColor": "#ab67e6"
      }
    },
    {
      "id": "natural.land",
      "geometry": {
        "fillColor": "#f7e3f7"
      }
    },
    {
      "id": "natural.land.landCover.crops",
      "geometry": {
        "fillColor": "#ffe0ea"
      }
    },
    {
      "id": "natural.land.landCover.dryCrops",
      "geometry": {
        "fillColor": "#ffe6ee"
      }
    },
    {
      "id": "natural.land.landCover.forest",
      "geometry": {
        "fillColor": "#ffcde0"
      }
    },
    {
      "id": "natural.land.landCover.sand",
      "geometry": {
        "fillColor": "#fff0f5"
      }
    },
    {
      "id": "natural.land.landCover.shrub",
      "geometry": {
        "fillColor": "#fdd6e5"
      }
    },
    {
      "id": "natural.land.landCover.tundra",
      "geometry": {
        "fillColor": "#f5eaf5"
      }
    },
    {
      "id": "natural.water",
      "geometry": {
        "fillColor": "#d4b2ff"
      },
      "label": {
        "textFillColor": "#3d2163",
        "textStrokeColor": "#f0e1ff"
      }
    },
    {
      "id": "pointOfInterest",
      "label": {
        "pinFillColor": "#e0349a",
        "textFillColor": "#a11e6e",
        "textStrokeColor": "#ffd9f0"
      }
    },
    {
      "id": "pointOfInterest.emergency.hospital",
      "geometry": {
        "fillColor": "#ffe3e3"
      }
    },
    {
      "id": "pointOfInterest.foodAndDrink",
      "label": {
        "visible": false
      }
    },
    {
      "id": "pointOfInterest.recreation.park",
      "geometry": {
        "fillOpacity": 1,
        "fillColor": "#f9b9d2"
      }
    }
  ]
}
\`\`\`

## **The JSON object**

A JSON style declaration consists of a top-level object that can contain style-level settings and an array of style rules.

* **Top-level settings** (optional) \- Global style settings like \`backgroundColor\` and \`variant\`.  
* **\`styles\`** \- An array of style rule objects. Each object consists of:  
  * **\`id\`** \- The feature to select for this style modification (e.g., \`pointOfInterest.recreation.park\`).  
  * **\`geometry\`** (optional) \- Style rules to apply to the feature's geometric elements.  
  * **\`label\`** (optional) \- Style rules to apply to the feature's label elements.

Style rules are applied in the order that you specify. Do not combine multiple operations into a single style operation. Instead, define each operation as a separate entry in the style array ([source](https://developers.google.com/maps/documentation/javascript/style-reference?content_ref=style+rules+are+applied+in+the+order+that+you+specify+do+not+combine+multiple+operations+into+a+single+style+operation+instead+define+each+operation+as+a+separate+entry+in+the+style+array)).

### **Style-Level Settings**

These items are exposed as part of the style but are not part of the styleable feature taxonomy.

| Field | Type | Example | Notes |
| :---- | :---- | :---- | :---- |
| \`backgroundColor\` | String | "\#002211" | \#RRGGBB hex string. Does not allow alpha. |
| \`variant\` | "light"|"dark" | "light" | If unspecified, defaults to "light" ([source](http://docs.google.com/document/d/1L7mJhXyaXJk6ideQrgtbw802yipx3JaUV94zFUIHUjY?content_ref=if+unspecified+set+to+light)). |
| \`monochrome\` | string|boolean | \`true\` | Use \`true\` for gray or an RGB hex string for a colorized version ([source](http://docs.google.com/document/d/1L7mJhXyaXJk6ideQrgtbw802yipx3JaUV94zFUIHUjY?content_ref=to+support+current+monochrome+and+later+colorized+monochrome+we+can+use+true+to+denote+gray+and+an+rgb+hex+color+string+to+denote+the+colorized+version)). |
| \`template\` | Enum | "ambient" | A base template to apply "under" user styles. |

## **\`id\` (Feature Type)**

Features, or feature types, are the geographic characteristics on the map that you can style. The \`id\` property of a style rule object specifies which feature to target.

The features form a category tree. If you specify a parent feature, such as \`pointOfInterest\`, the styles you specify for the parent apply to all its children, such as \`pointOfInterest.retail\` and \`pointOfInterest.lodging\`.

The following feature \`id\` values are available:

* View all supported feature IDs  
* \`pointOfInterest.emergency\`  
*  \`pointOfInterest.emergency.fire\`  
* \`pointOfInterest.emergency.hospital\`  
* \`pointOfInterest.emergency.pharmacy\`  
* \`pointOfInterest.emergency.police\`  
* \`pointOfInterest.entertainment\`  
* \`pointOfInterest.entertainment.arts\`  
* \`pointOfInterest.entertainment.casino\`  
* \`pointOfInterest.entertainment.cinema\`  
* \`pointOfInterest.entertainment.historic\`  
* \`pointOfInterest.entertainment.museum\`  
* \`pointOfInterest.entertainment.themePark\`  
* \`pointOfInterest.entertainment.touristAttraction\`  
* \`pointOfInterest.foodAndDrink\`  
* \`pointOfInterest.foodAndDrink.bar\`  
* \`pointOfInterest.foodAndDrink.cafe\`  
* \`pointOfInterest.foodAndDrink.restaurant\`  
* \`pointOfInterest.foodAndDrink.winery\`  
* \`pointOfInterest.landmark\`  
* \`pointOfInterest.lodging\`  
* \`pointOfInterest.recreation\`  
* \`pointOfInterest.recreation.beach\`  
* \`pointOfInterest.recreation.boating\`  
* \`pointOfInterest.recreation.fishing\`  
* \`pointOfInterest.recreation.golfCourse\`  
* \`pointOfInterest.recreation.hotSpring\`  
* \`pointOfInterest.recreation.natureReserve\`  
* \`pointOfInterest.recreation.park\`  
* \`pointOfInterest.recreation.peak\`  
* \`pointOfInterest.recreation.sportsComplex\`  
* \`pointOfInterest.recreation.sportsField\`  
* \`pointOfInterest.recreation.trailhead\`  
* \`pointOfInterest.recreation.zoo\`  
* \`pointOfInterest.retail\`  
* \`pointOfInterest.retail.grocery\`  
* \`pointOfInterest.retail.shopping\`  
* \`pointOfInterest.service\`  
* \`pointOfInterest.service.atm\`  
* \`pointOfInterest.service.bank\`  
* \`pointOfInterest.service.carRental\`  
* \`pointOfInterest.service.evCharging\`  
* \`pointOfInterest.service.gasStation\`  
* \`pointOfInterest.service.parkingLot\`  
* \`pointOfInterest.service.postOffice\`  
* \`pointOfInterest.service.restStop\`  
* \`pointOfInterest.service.restroom\`  
* \`pointOfInterest.transit\`  
* \`pointOfInterest.transit.airport\`  
* \`pointOfInterest.other\`  
* \`pointOfInterest.other.bridge\`  
* \`pointOfInterest.other.cemetery\`  
* \`pointOfInterest.other.government\`  
* \`pointOfInterest.other.library\`  
* \`pointOfInterest.other.military\`  
* \`pointOfInterest.other.placeOfWorship\`  
* \`pointOfInterest.other.school\`  
* \`pointOfInterest.other.townSquare\`  
* \`pointOfInterest\`  
* \`political.countryOrRegion\`  
* \`political.border\`  
* \`political.reservation\`  
* \`political.stateOrProvince\`  
* \`political.city\`  
* \`political.sublocality\`  
* \`political.neighborhood\`  
* \`political.landParcel\`  
* \`political\`  
* \`infrastructure\`  
* \`infrastructure.building\`  
* \`infrastructure.building.commercial\`  
* \`infrastructure.businessCorridor\`  
* \`infrastructure.roadNetwork.noTraffic.pedestrianMall\`  
* \`infrastructure.roadNetwork.noTraffic.trail.paved\`  
* \`infrastructure.roadNetwork.noTraffic.trail.unpaved\`  
* \`infrastructure.roadNetwork.noTraffic.trail\`  
* \`infrastructure.roadNetwork.noTraffic\`  
* \`infrastructure.roadNetwork.parkingAisle\`  
* \`infrastructure.roadNetwork.ramp\`  
* \`infrastructure.roadNetwork.road\`  
* \`infrastructure.roadNetwork.road.arterial\`  
* \`infrastructure.roadNetwork.road.highway\`  
* \`infrastructure.roadNetwork.road.local\`  
* \`infrastructure.roadNetwork.road.noOutlet\`  
* \`infrastructure.roadNetwork.roadShield\`  
* \`infrastructure.roadNetwork.roadSign\`  
* \`infrastructure.roadNetwork.roadDetail\`  
* \`infrastructure.roadNetwork.roadDetail.surface\`  
* \`infrastructure.roadNetwork.roadDetail.crosswalk\`  
* \`infrastructure.roadNetwork.roadDetail.sidewalk\`  
* \`infrastructure.roadNetwork.roadDetail.intersection\`  
* \`infrastructure.roadNetwork\`  
* \`infrastructure.railwayTrack\`  
* \`infrastructure.railwayTrack.commercial\`  
* \`infrastructure.railwayTrack.commuter\`  
* \`infrastructure.transitStation\`  
* \`infrastructure.transitStation.bicycleShare\`  
* \`infrastructure.transitStation.busStation\`  
* \`infrastructure.transitStation.ferryTerminal\`  
* \`infrastructure.transitStation.funicularStation\`  
* \`infrastructure.transitStation.gondolaStation\`  
* \`infrastructure.transitStation.monorail\`  
* \`infrastructure.transitStation.railStation\`  
* \`infrastructure.transitStation.railStation.subwayStation\`  
* \`infrastructure.transitStation.railStation.tramStation\`  
* \`infrastructure.urbanArea\`  
* \`natural\`  
* \`natural.base\`  
* \`natural.continent\`  
* \`natural.archipelago\`  
* \`natural.island\`  
* \`natural.land.landCover.crops\`  
* \`natural.land.landCover.dryCrops\`  
* \`natural.land.landCover.forest\`  
* \`natural.land.landCover.ice\`  
* \`natural.land.landCover.sand\`  
* \`natural.land.landCover.shrub\`  
* \`natural.land.landCover.tundra\`  
* \`natural.land.landCover\`  
* \`natural.land\`  
* \`natural.water.ocean\`  
* \`natural.water.lake\`  
* \`natural.water.river\`  
* \`natural.water.other\`  
* \`natural.water\`

## **\`elements\`**

Elements are subdivisions of a feature. A road, for example, consists of the graphical line (the geometry) on the map, and also the text denoting its name (a label). The following elements are available:

* **\`geometry\`**: Selects all geometric elements of the specified feature.  
* **\`label\`**: Selects the textual labels associated with the specified feature.

## **\`stylers\`**

Stylers are formatting options that you can apply to map features and elements. The following style options are supported. Colors are represented as an \#RRGGBB hex string, and opacity is handled separately with an opacity property ([source](http://docs.google.com/document/d/1L7mJhXyaXJk6ideQrgtbw802yipx3JaUV94zFUIHUjY?content_ref=note+that+the+decision+has+been+made+to+canonically+choose+rrggbb+as+the+supported+format+for+all+color+fields+alpha+opacity+is+represented+separately+between+0+1)).

| Styler | Type | Applicable To | Notes |
| :---- | :---- | :---- | :---- |
| \`visible\` | boolean | \`geometry\`, \`label\` | \`true\` or \`false\` |
| \`fillColor\` | string | \`geometry\` | RGB hex string (e.g., \`#ff00ff\`) |
| \`fillAlpha\` | float | \`geometry\` | Opacity, clamped to \[0, 1\] |
| \`strokeColor\` | string | \`geometry\` | RGB hex string (e.g., \`#ffff00\`) |
| \`strokeAlpha\` | float | \`geometry\` | Opacity, clamped to \[0, 1\] |
| \`strokeWidth\` | float | \`geometry\` | Clamped to \[0, 8\] |
| \`textFillColor\` | string | \`label\` | RGB hex string (e.g., \`#ff00ff\`) |
| \`textFillAlpha\` | float | \`label\` | Opacity, clamped to \[0, 1\] |
| \`textStrokeColor\` | string | \`label\` | RGB hex string (e.g., \`#ffff00\`) |
| \`textStrokeAlpha\` | float | \`label\` | Opacity, clamped to \[0, 1\] |
| \`textStrokeWidth\` | float | \`label\` | Clamped to \[0, 8\] |
| \`pinFillColor\` | string | \`label\` | RGB hex string (e.g., \`#00ffff\`) |
| \`pinOutlineColor\` | string | \`label\` | RGB hex string (e.g., \`#00ffff\`) |
| \`pinGlyphColor\` | string | \`label\` | RGB hex string (e.g., \`#00ffff\`) |

## **Keyzooms**

Stylers can be specified as a literal value or as a map of zoom levels to values. A literal value is implicitly treated as the style for zoom level 0\. For zoom-dependent styling, provide an object where keys are the zoom level (e.g., \`"z6"\`) and values are the desired style for that zoom level. The style applies from the specified zoom level until the next one defined.

\`\`\`json
{
  "id": "natural.water",
  "geometry": {
    "fillColor": {
      "z0": "#000000",
      "z6": "#666666",
      "z12": "#cccccc"
    }
  }
}
\`\`\`

`
