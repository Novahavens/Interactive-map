/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
export const EXAMPLE_STYLE = `{
  "variant": "light",
  "styles": [
    {
      "id": "infrastructure",
      "geometry": {
        "visible": true
      },
      "label": {
        "visible": true
      }
    },
    {
      "id": "infrastructure.building",
      "geometry": {
        "visible": true
      },
      "label": {
        "visible": true
      }
    },
    {
      "id": "infrastructure.building.commercial",
      "geometry": {
        "visible": {
          "z00": true,
          "z16": false,
          "z17": true
        },
        "fillColor": {
          "z00": "#eae9eb",
          "z16": "#fbf3dc",
          "z17": "#fdf9ef"
        },
        "strokeColor": {
          "z00": "#e7e6e8",
          "z16": "#ece3cb",
          "z17": "#e9dfc9"
        }
      }
    },
    {
      "id": "infrastructure.businessCorridor",
      "geometry": {
        "visible": {
          "z00": false,
          "z12": true,
          "z17": false
        },
        "fillColor": "#f8f0de"
      }
    },
    {
      "id": "infrastructure.railwayTrack",
      "geometry": {
        "visible": true
      }
    },
    {
      "id": "infrastructure.railwayTrack.commercial",
      "geometry": {
        "visible": {
          "z00": true,
          "z11": true
        },
        "fillColor": {
          "z00": "#dadce0",
          "z11": "#dadce0",
          "z20": "#bdc1c6"
        },
        "strokeColor": {
          "z00": "#e8eaed",
          "z11": "#e8eaed",
          "z20": "#bdc1c6"
        }
      }
    },
    {
      "id": "infrastructure.railwayTrack.commuter",
      "geometry": {
        "visible": true
      }
    },
    {
      "id": "infrastructure.roadNetwork",
      "geometry": {
        "visible": true
      },
      "label": {
        "visible": true
      }
    },
    {
      "id": "infrastructure.roadNetwork.noTraffic",
      "geometry": {
        "visible": {
          "z00": true,
          "z14": true
        },
        "fillColor": {
          "z00": "#e9e9eb",
          "z16": "#e9e9eb",
          "z17": "#cfd9e3"
        },
        "strokeColor": "#9ca5b4"
      },
      "label": {
        "visible": {
          "z00": true,
          "z17": true
        },
        "textFillColor": "#505e6c"
      }
    },
    {
      "id": "infrastructure.roadNetwork.noTraffic.pedestrianMall",
      "geometry": {
        "visible": {
          "z00": true,
          "z14": true
        },
        "fillColor": {
          "z00": "#e9e9eb",
          "z16": "#e9e9eb",
          "z17": "#cfd9e3"
        }
      }
    },
    {
      "id": "infrastructure.roadNetwork.noTraffic.trail",
      "geometry": {
        "visible": {
          "z00": true,
          "z09": true
        },
        "fillColor": {
          "z00": "#e9e9eb",
          "z16": "#e9e9eb",
          "z17": "#cfd9e3"
        },
        "strokeColor": "#9ca5b4"
      },
      "label": {
        "visible": {
          "z00": true,
          "z17": true
        },
        "textFillColor": "#505e6c"
      }
    },
    {
      "id": "infrastructure.roadNetwork.noTraffic.trail.paved",
      "geometry": {
        "visible": {
          "z00": true,
          "z09": true
        },
        "fillColor": {
          "z00": "#e9e9eb",
          "z09": "#75c7ac"
        },
        "strokeColor": "#9ca5b4"
      },
      "label": {
        "visible": {
          "z00": true,
          "z17": true
        },
        "textFillColor": "#505e6c"
      }
    },
    {
      "id": "infrastructure.roadNetwork.noTraffic.trail.unpaved",
      "geometry": {
        "visible": {
          "z00": true,
          "z09": true
        },
        "fillColor": {
          "z00": "#e9e9eb",
          "z09": "#75c7ac"
        },
        "strokeColor": "#9ca5b4"
      },
      "label": {
        "visible": {
          "z00": true,
          "z17": true
        },
        "textFillColor": "#505e6c"
      }
    },
    {
      "id": "infrastructure.roadNetwork.parkingAisle",
      "geometry": {
        "visible": {
          "z00": false,
          "z17": true
        },
        "fillColor": {
          "z00": "#f1f3f4",
          "z15": "#f1f3f4"
        },
        "strokeColor": {
          "z00": "#dadce0",
          "z15": "#dadce0"
        }
      }
    },
    {
      "id": "infrastructure.roadNetwork.ramp",
      "geometry": {
        "visible": {
          "z00": true,
          "z12": true
        },
        "fillColor": {
          "z00": "#b4bbc9",
          "z08": "#b4bbc9",
          "z12": "#b4bbc9",
          "z13": "#d8e0e7",
          "z17": "#d8e0e7",
          "z19": "#aab9c9"
        },
        "strokeColor": {
          "z00": "#b4bbc9",
          "z08": "#b4bbc9",
          "z13": "#c7d0d7",
          "z15": "#bdc8d0",
          "z17": "#bdc8d0",
          "z19": "#a1b2c4"
        }
      },
      "label": {
        "visible": true
      }
    },
    {
      "id": "infrastructure.roadNetwork.road",
      "geometry": {
        "visible": true
      },
      "label": {
        "visible": true,
        "textFillColor": {
          "z00": "#202124",
          "z13": "#202124",
          "z14": "#29394c",
          "z17": "#4d5d6f",
          "z18": "#ffffff"
        },
        "textStrokeColor": {
          "z00": "#ffffff",
          "z17": "#ffffff",
          "z18": "#4c5f76"
        }
      }
    },
    {
      "id": "infrastructure.roadNetwork.road.arterial",
      "geometry": {
        "visible": {
          "z00": true,
          "z05": true
        },
        "fillColor": {
          "z00": "#b4bbc9",
          "z08": "#b4bbc9",
          "z12": "#b4bbc9",
          "z13": "#d8e0e7",
          "z17": "#d8e0e7",
          "z19": "#aab9c9"
        },
        "strokeColor": {
          "z00": "#b4bbc9",
          "z08": "#b4bbc9",
          "z13": "#c7d0d7",
          "z15": "#bdc8d0",
          "z17": "#bdc8d0",
          "z19": "#a1b2c4"
        }
      },
      "label": {
        "visible": true,
        "textFillColor": {
          "z00": "#202124",
          "z13": "#202124",
          "z14": "#29394c",
          "z17": "#4d5d6f",
          "z18": "#ffffff"
        },
        "textStrokeColor": {
          "z00": "#ffffff",
          "z17": "#ffffff",
          "z18": "#4c5f76"
        }
      }
    },
    {
      "id": "infrastructure.roadNetwork.road.highway",
      "geometry": {
        "visible": {
          "z00": true,
          "z05": true
        },
        "fillColor": {
          "z00": "#8face4",
          "z05": "#8face4",
          "z08": "#abbcd6",
          "z12": "#abbcd6",
          "z14": "#8ba5c1"
        },
        "strokeColor": {
          "z00": "#677baa",
          "z05": "#677baa",
          "z12": "#677baa",
          "z14": "#7090b2"
        }
      },
      "label": {
        "visible": true,
        "textFillColor": {
          "z00": "#263754",
          "z16": "#263754",
          "z17": "#f3f7ff"
        },
        "textStrokeColor": {
          "z00": "#ffffff",
          "z16": "#ffffff",
          "z17": "#4a6088"
        }
      }
    },
    {
      "id": "infrastructure.roadNetwork.road.local",
      "geometry": {
        "visible": {
          "z00": true,
          "z12": true
        },
        "fillColor": {
          "z00": "#d8e0e7",
          "z15": "#d8e0e7",
          "z16": "#ccd7e0",
          "z17": "#d8e0e7",
          "z19": "#aab9c9"
        },
        "strokeColor": {
          "z00": "#c7d0d7",
          "z17": "#c7d0d7",
          "z19": "#a1b2c4"
        }
      },
      "label": {
        "visible": true,
        "textFillColor": {
          "z00": "#202124",
          "z13": "#202124",
          "z14": "#29394c",
          "z15": "#1a385e",
          "z16": "#44566d",
          "z17": "#4d5d6f",
          "z18": "#ffffff"
        },
        "textStrokeColor": {
          "z00": "#ffffff",
          "z17": "#ffffff",
          "z18": "#4c5f76"
        }
      }
    },
    {
      "id": "infrastructure.roadNetwork.road.noOutlet",
      "geometry": {
        "visible": {
          "z00": true,
          "z14": true
        },
        "fillColor": {
          "z00": "#cfd9e3",
          "z17": "#cfd9e3",
          "z19": "#aab9c9"
        },
        "strokeColor": {
          "z00": "#9ca5b4",
          "z17": "#c4ccd9",
          "z19": "#a1b2c4"
        }
      },
      "label": {
        "visible": true,
        "textFillColor": {
          "z00": "#202124",
          "z13": "#202124",
          "z14": "#29394c",
          "z15": "#70757a",
          "z16": "#70757a",
          "z17": "#5d7087",
          "z18": "#ffffff"
        },
        "textStrokeColor": {
          "z00": "#ffffff",
          "z17": "#ffffff",
          "z18": "#5d7087"
        }
      }
    },
    {
      "id": "infrastructure.roadNetwork.roadDetail",
      "geometry": {
        "visible": true
      },
      "label": {
        "visible": true
      }
    },
    {
      "id": "infrastructure.roadNetwork.roadDetail.crosswalk",
      "geometry": {
        "visible": {
          "z00": false,
          "z17": true
        },
        "fillColor": {
          "z00": "#f0f6fc",
          "z17": "#f0f6fc",
          "z18": "#dfe6ee"
        }
      }
    },
    {
      "id": "infrastructure.roadNetwork.roadDetail.intersection",
      "label": {
        "visible": false
      }
    },
    {
      "id": "infrastructure.roadNetwork.roadDetail.sidewalk",
      "geometry": {
        "visible": {
          "z00": false,
          "z17": true
        },
        "fillColor": {
          "z00": "#ffffff",
          "z16": "#ffffff"
        }
      }
    },
    {
      "id": "infrastructure.roadNetwork.roadDetail.surface",
      "geometry": {
        "visible": true
      },
      "label": {
        "visible": true
      }
    },
    {
      "id": "infrastructure.roadNetwork.roadShield",
      "label": {
        "visible": false
      }
    },
    {
      "id": "infrastructure.roadNetwork.roadSign",
      "label": {
        "visible": {
          "z00": false,
          "z14": true
        },
        "textFillColor": "#444444"
      }
    },
    {
      "id": "infrastructure.transitStation",
      "label": {
        "visible": true,
        "textFillColor": {
          "z00": "#3b5162",
          "z11": "#3b5162"
        }
      }
    },
    {
      "id": "infrastructure.transitStation.bicycleShare",
      "label": {
        "visible": {
          "z00": false,
          "z20": true
        },
        "textFillColor": {
          "z00": "#3b5162",
          "z11": "#3b5162"
        }
      }
    },
    {
      "id": "infrastructure.transitStation.busStation",
      "label": {
        "visible": true,
        "textFillColor": {
          "z00": "#3b5162",
          "z11": "#3b5162"
        }
      }
    },
    {
      "id": "infrastructure.transitStation.ferryTerminal",
      "label": {
        "visible": true,
        "textFillColor": {
          "z00": "#3b5162",
          "z11": "#3b5162"
        }
      }
    },
    {
      "id": "infrastructure.transitStation.funicularStation",
      "label": {
        "visible": true,
        "textFillColor": {
          "z00": "#3b5162",
          "z11": "#3b5162"
        }
      }
    },
    {
      "id": "infrastructure.transitStation.gondolaStation",
      "label": {
        "visible": true,
        "textFillColor": {
          "z00": "#3b5162",
          "z11": "#3b5162"
        }
      }
    },
    {
      "id": "infrastructure.transitStation.monorail",
      "label": {
        "visible": true,
        "textFillColor": {
          "z00": "#3b5162",
          "z11": "#3b5162"
        }
      }
    },
    {
      "id": "infrastructure.transitStation.railStation",
      "label": {
        "visible": true,
        "textFillColor": {
          "z00": "#3b5162",
          "z11": "#3b5162"
        }
      }
    },
    {
      "id": "infrastructure.transitStation.railStation.subwayStation",
      "label": {
        "visible": true
      }
    },
    {
      "id": "infrastructure.transitStation.railStation.tramStation",
      "label": {
        "visible": true,
        "textFillColor": {
          "z00": "#3b5162",
          "z11": "#3b5162"
        }
      }
    },
    {
      "id": "infrastructure.urbanArea",
      "geometry": {
        "visible": true,
        "fillColor": {
          "z00": "#f7f7f7",
          "z12": "#f7f7f7",
          "z14": "#f5f3f3",
          "z15": "#f5f3f3",
          "z17": "#f8f7f7"
        }
      }
    },
    {
      "id": "natural",
      "geometry": {
        "visible": true
      },
      "label": {
        "visible": true
      }
    },
    {
      "id": "natural.archipelago",
      "label": {
        "visible": {
          "z00": true,
          "z03": true
        },
        "textFillColor": "#185abc",
        "textStrokeColor": {
          "z00": "#abebff",
          "z10": "#abebff",
          "z11": "#a5e7fa",
          "z12": "#9ee2f5"
        }
      }
    },
    {
      "id": "natural.base",
      "geometry": {
        "visible": true,
        "fillColor": {
          "z00": "#fdfcfb",
          "z15": "#fcfaf8",
          "z17": "#f8f7f7"
        }
      }
    },
    {
      "id": "natural.continent",
      "label": {
        "visible": {
          "z00": false,
          "z01": true,
          "z02": true,
          "z11": false
        },
        "textFillColor": {
          "z00": "#262626",
          "z01": "#262626"
        }
      }
    },
    {
      "id": "natural.island",
      "label": {
        "visible": {
          "z00": true,
          "z04": true
        },
        "textFillColor": {
          "z00": "#202124",
          "z04": "#202124"
        }
      }
    },
    {
      "id": "natural.land.landCover",
      "geometry": {
        "visible": true,
        "fillColor": "#ceead6"
      }
    },
    {
      "id": "natural.land.landCover.crops",
      "geometry": {
        "visible": true,
        "fillColor": {
          "z00": "#a7e6cc",
          "z05": "#a7e6cc",
          "z08": "#bff2d5",
          "z10": "#d3f8e2"
        }
      }
    },
    {
      "id": "natural.land.landCover.dryCrops",
      "geometry": {
        "visible": true,
        "fillColor": {
          "z00": "#bbecd8",
          "z05": "#bbecd8",
          "z08": "#cff6e0",
          "z10": "#d3f8e2"
        }
      }
    },
    {
      "id": "natural.land.landCover.forest",
      "geometry": {
        "visible": true,
        "fillColor": {
          "z00": "#90e0be",
          "z05": "#90e0be",
          "z08": "#afefca",
          "z10": "#d3f8e2"
        }
      }
    },
    {
      "id": "natural.land.landCover.ice",
      "geometry": {
        "visible": true,
        "fillColor": {
          "z00": "#ffffff",
          "z12": "#ffffff",
          "z14": "#ebe9e5"
        }
      }
    },
    {
      "id": "natural.land.landCover.sand",
      "geometry": {
        "visible": true,
        "fillColor": {
          "z00": "#f5f0e4",
          "z03": "#fbf8f3",
          "z07": "#fbf8f3",
          "z09": "#f5f0e6"
        }
      }
    },
    {
      "id": "natural.land.landCover.shrub",
      "geometry": {
        "visible": true,
        "fillColor": {
          "z00": "#f1e9d7",
          "z03": "#f5f0e4",
          "z08": "#f5f0e5"
        }
      }
    },
    {
      "id": "natural.land.landCover.tundra",
      "geometry": {
        "visible": true,
        "fillColor": {
          "z00": "#ccd0cb",
          "z08": "#ccd0cb",
          "z11": "#f5f0e5"
        }
      }
    },
    {
      "id": "natural.water",
      "geometry": {
        "visible": true,
        "fillColor": {
          "z00": "#54cee3",
          "z10": "#90daee"
        }
      },
      "label": {
        "visible": true,
        "textFillColor": {
          "z00": "#11728d",
          "z10": "#0a8699"
        }
      }
    },
    {
      "id": "natural.water.lake",
      "label": {
        "visible": {
          "z00": false,
          "z06": true
        },
        "textFillColor": {
          "z00": "#11728d",
          "z10": "#0a8699"
        }
      }
    },
    {
      "id": "natural.water.ocean",
      "label": {
        "visible": true,
        "textFillColor": {
          "z00": "#11728d",
          "z10": "#0a8699"
        }
      }
    },
    {
      "id": "natural.water.other",
      "label": {
        "visible": {
          "z00": false,
          "z13": true
        },
        "textFillColor": {
          "z00": "#11728d",
          "z10": "#0a8699"
        }
      }
    },
    {
      "id": "natural.water.river",
      "label": {
        "visible": true,
        "textFillColor": {
          "z00": "#11728d",
          "z10": "#0a8699"
        }
      }
    },
    {
      "id": "pointOfInterest",
      "geometry": {
        "visible": true
      },
      "label": {
        "visible": true
      }
    },
    {
      "id": "pointOfInterest.emergency",
      "geometry": {
        "visible": false
      },
      "label": {
        "visible": true,
        "pinFillColor": "#f74a55",
        "textFillColor": "#dc3b45",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.emergency.fire",
      "label": {
        "visible": true,
        "pinFillColor": "#f74a55",
        "textFillColor": "#dc3b45",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.emergency.hospital",
      "geometry": {
        "visible": {
          "z00": false,
          "z12": true
        },
        "fillColor": {
          "z00": "#fce8e6",
          "z16": "#fce8e6",
          "z17": "#fffaf9"
        }
      },
      "label": {
        "visible": true,
        "pinFillColor": "#f74a55",
        "textFillColor": "#dc3b45",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.emergency.pharmacy",
      "label": {
        "visible": true,
        "pinFillColor": "#f74a55",
        "textFillColor": "#dc3b45",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.emergency.police",
      "label": {
        "visible": true,
        "pinFillColor": "#78909c",
        "textFillColor": "#546e7a",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.entertainment",
      "label": {
        "visible": true,
        "pinFillColor": "#b56aff",
        "textFillColor": "#8242d3",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.entertainment.arts",
      "label": {
        "visible": true,
        "pinFillColor": "#b56aff",
        "textFillColor": "#8242d3",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.entertainment.casino",
      "label": {
        "visible": true,
        "pinFillColor": "#b56aff",
        "textFillColor": "#8242d3",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.entertainment.cinema",
      "label": {
        "visible": true,
        "pinFillColor": "#b56aff",
        "textFillColor": "#8242d3",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.entertainment.historic",
      "label": {
        "visible": true,
        "pinFillColor": "#b56aff",
        "textFillColor": "#8242d3",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.entertainment.museum",
      "label": {
        "visible": true,
        "pinFillColor": "#b56aff",
        "textFillColor": "#8242d3",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.entertainment.themePark",
      "label": {
        "visible": true,
        "pinFillColor": "#b56aff",
        "textFillColor": "#8242d3",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.entertainment.touristAttraction",
      "label": {
        "visible": true,
        "pinFillColor": "#b56aff",
        "textFillColor": "#8242d3",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.foodAndDrink",
      "label": {
        "visible": true,
        "pinFillColor": "#ff8126",
        "textFillColor": "#d65900",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.foodAndDrink.bar",
      "label": {
        "visible": true
      }
    },
    {
      "id": "pointOfInterest.foodAndDrink.cafe",
      "label": {
        "visible": true,
        "pinFillColor": "#ff8126",
        "textFillColor": "#d65900",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.foodAndDrink.restaurant",
      "label": {
        "visible": true,
        "pinFillColor": "#ff8126",
        "textFillColor": "#d65900",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.foodAndDrink.winery",
      "label": {
        "visible": true,
        "pinFillColor": "#ff8126",
        "textFillColor": "#d65900",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.landmark",
      "label": {
        "visible": {
          "z00": false,
          "z11": true
        },
        "textFillColor": "#3c4043",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.lodging",
      "label": {
        "visible": true,
        "pinFillColor": "#f848c7",
        "textFillColor": "#e329ae",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.other",
      "geometry": {
        "visible": true
      },
      "label": {
        "visible": true,
        "pinFillColor": "#78909c",
        "textFillColor": "#546e7a",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.other.bridge",
      "label": {
        "visible": true,
        "pinFillColor": "#78909c",
        "textFillColor": "#546e7a",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.other.cemetery",
      "geometry": {
        "visible": {
          "z00": true,
          "z08": true
        },
        "fillColor": "#c3f1d5"
      },
      "label": {
        "visible": true,
        "pinFillColor": "#78909c",
        "textFillColor": "#546e7a",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.other.government",
      "label": {
        "visible": true,
        "pinFillColor": "#78909c",
        "textFillColor": "#546e7a",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.other.library",
      "label": {
        "visible": true,
        "pinFillColor": "#78909c",
        "textFillColor": "#546e7a",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.other.military",
      "label": {
        "visible": true,
        "pinFillColor": "#78909c",
        "textFillColor": "#546e7a",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.other.placeOfWorship",
      "label": {
        "visible": true,
        "pinFillColor": "#78909c",
        "textFillColor": "#546e7a",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.other.school",
      "label": {
        "visible": true,
        "pinFillColor": "#78909c",
        "textFillColor": "#546e7a",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.other.townSquare",
      "label": {
        "visible": true,
        "textFillColor": "#546e7a",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.recreation",
      "geometry": {
        "visible": true
      },
      "label": {
        "visible": true,
        "textFillColor": "#3b3b3b",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.recreation.beach",
      "geometry": {
        "visible": true,
        "fillColor": "#f7eccf"
      },
      "label": {
        "visible": true,
        "pinFillColor": "#17a773",
        "textFillColor": "#19865f",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.recreation.boating",
      "label": {
        "visible": true,
        "pinFillColor": "#17a773",
        "textFillColor": "#19865f",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.recreation.fishing",
      "label": {
        "visible": true,
        "pinFillColor": "#17a773",
        "textFillColor": "#19865f",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.recreation.golfCourse",
      "geometry": {
        "visible": {
          "z00": false,
          "z10": true
        },
        "fillColor": {
          "z00": "#c3f1d5",
          "z05": "#c3f1d5"
        }
      },
      "label": {
        "visible": true,
        "pinFillColor": "#17a773",
        "textFillColor": "#19865f",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.recreation.hotSpring",
      "label": {
        "visible": true,
        "pinFillColor": "#17a773",
        "textFillColor": "#19865f",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.recreation.natureReserve",
      "geometry": {
        "visible": {
          "z00": false,
          "z06": true
        },
        "fillColor": {
          "z00": "#8bd5ba",
          "z05": "#8bd5ba",
          "z08": "#afefca",
          "z12": "#c3f1d5"
        }
      },
      "label": {
        "visible": true,
        "textFillColor": "#19865f",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.recreation.park",
      "geometry": {
        "visible": {
          "z00": false,
          "z05": true
        },
        "fillColor": {
          "z00": "#8bd5ba",
          "z05": "#8bd5ba",
          "z08": "#afefca",
          "z11": "#c3f1d5"
        }
      },
      "label": {
        "visible": true,
        "pinFillColor": "#17a773",
        "textFillColor": "#19865f",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.recreation.peak",
      "label": {
        "visible": true,
        "pinFillColor": "#17a773",
        "textFillColor": "#19865f",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.recreation.sportsComplex",
      "geometry": {
        "visible": {
          "z00": true,
          "z10": true
        },
        "fillColor": {
          "z00": "#c3f1d5",
          "z13": "#c3f1d5",
          "z15": "#a9eac2"
        }
      },
      "label": {
        "visible": true,
        "pinFillColor": "#17a773",
        "textFillColor": "#19865f",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.recreation.sportsField",
      "geometry": {
        "visible": {
          "z00": true,
          "z10": true
        },
        "fillColor": {
          "z00": "#c3f1d5",
          "z13": "#c3f1d5",
          "z16": "#a9eac2"
        }
      },
      "label": {
        "visible": true,
        "pinFillColor": "#17a773",
        "textFillColor": "#19865f",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.recreation.trailhead",
      "label": {
        "visible": true,
        "pinFillColor": "#17a773",
        "textFillColor": "#19865f",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.recreation.zoo",
      "geometry": {
        "visible": {
          "z00": true,
          "z12": true
        },
        "fillColor": "#c3f1d5"
      },
      "label": {
        "visible": true,
        "pinFillColor": "#17a773",
        "textFillColor": "#19865f",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.retail",
      "label": {
        "visible": true,
        "pinFillColor": "#0597ff",
        "textFillColor": "#1a73e8",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.retail.grocery",
      "label": {
        "visible": true,
        "pinFillColor": "#0597ff",
        "textFillColor": "#1a73e8",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.retail.shopping",
      "label": {
        "visible": true,
        "pinFillColor": "#0597ff",
        "textFillColor": "#1a73e8",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.service",
      "geometry": {
        "visible": false
      },
      "label": {
        "visible": true,
        "pinFillColor": "#697ad4",
        "textFillColor": "#5c6bc0",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.service.atm",
      "label": {
        "visible": true,
        "pinFillColor": "#697ad4",
        "textFillColor": "#5c6bc0",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.service.bank",
      "label": {
        "visible": true,
        "pinFillColor": "#697ad4",
        "textFillColor": "#5c6bc0",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.service.carRental",
      "label": {
        "visible": true,
        "pinFillColor": "#697ad4",
        "textFillColor": "#5c6bc0",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.service.evCharging",
      "label": {
        "visible": true,
        "pinFillColor": "#c1e7cf",
        "textFillColor": "#176c62",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.service.gasStation",
      "label": {
        "visible": true,
        "pinFillColor": "#697ad4",
        "textFillColor": "#5c6bc0",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.service.parkingLot",
      "geometry": {
        "visible": {
          "z00": false,
          "z17": true
        },
        "fillColor": "#ffffff"
      },
      "label": {
        "visible": true,
        "pinFillColor": "#b3c8ff",
        "textFillColor": "#3a69e0",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.service.postOffice",
      "label": {
        "visible": true,
        "pinFillColor": "#78909c",
        "textFillColor": "#546e7a",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.service.restroom",
      "label": {
        "visible": true,
        "pinFillColor": "#697ad4",
        "textFillColor": "#5c6bc0",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.service.restStop",
      "label": {
        "visible": true,
        "pinFillColor": "#78909c",
        "textFillColor": "#546e7a",
        "textStrokeColor": "#ffffff"
      }
    },
    {
      "id": "pointOfInterest.transit",
      "geometry": {
        "visible": true
      },
      "label": {
        "visible": true
      }
    },
    {
      "id": "pointOfInterest.transit.airport",
      "geometry": {
        "visible": true
      },
      "label": {
        "visible": true
      }
    },
    {
      "id": "political",
      "geometry": {
        "visible": true
      },
      "label": {
        "visible": true
      }
    },
    {
      "id": "political.border",
      "geometry": {
        "color": "#282a2d"
      }
    },
    {
      "id": "political.city",
      "label": {
        "visible": {
          "z00": true,
          "z04": true,
          "z16": false
        },
        "textFillColor": "#2f3034"
      }
    },
    {
      "id": "political.countryOrRegion",
      "label": {
        "visible": {
          "z00": true,
          "z02": true,
          "z11": false
        },
        "textFillColor": "#191a1c"
      }
    },
    {
      "id": "political.landParcel",
      "geometry": {
        "visible": {
          "z00": true,
          "z17": false,
          "z19": true
        },
        "strokeColor": {
          "z00": "#e6e6e6",
          "z17": "#e6e6e6"
        }
      }
    },
    {
      "id": "political.neighborhood",
      "label": {
        "visible": {
          "z00": false,
          "z11": true
        },
        "textFillColor": "#2f3034"
      }
    },
    {
      "id": "political.reservation",
      "geometry": {
        "visible": true,
        "fillColor": "#d6d9d6",
        "strokeColor": "#c0c6bf"
      },
      "label": {
        "visible": {
          "z00": true,
          "z06": true
        },
        "textFillColor": {
          "z00": "#70757a",
          "z05": "#70757a"
        }
      }
    },
    {
      "id": "political.stateOrProvince",
      "geometry": {
        "visible": {
          "z00": false,
          "z07": true
        },
        "fillColor": {
          "z00": "#80868b",
          "z03": "#5f6368"
        }
      },
      "label": {
        "visible": true,
        "textFillColor": "#4e5256"
      }
    },
    {
      "id": "political.sublocality",
      "label": {
        "visible": {
          "z00": true,
          "z16": false
        },
        "textFillColor": "#5f6368"
      }
    }
  ]
}`
