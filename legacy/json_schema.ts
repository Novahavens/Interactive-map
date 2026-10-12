/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
// Copied from https://developers.google.com/static/maps/cbms-json-schema.json

export const JSONSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Google Maps Platform Stylesheet",
  "description": "JSON Schema for a Google Maps Platform stylesheet.",
  "type": "object",
  "additionalProperties": false,
  "$defs": {
    "visibilityType": {
      "oneOf": [
        {
          "type": "boolean"
        },
        {
          "type": "object",
          "propertyNames": {
            "$ref": "#/$defs/zoomKeys"
          },
          "patternProperties": {
            ".*": {
              "type": "boolean"
            }
          }
        }
      ]
    },
    "colorType": {
      "oneOf": [
        {
          "type": "string",
          "pattern": "^#([a-fA-F0-9]{6})$"
        },
        {
          "type": "object",
          "propertyNames": {
            "$ref": "#/$defs/zoomKeys"
          },
          "patternProperties": {
            ".*": {
              "type": "string",
              "pattern": "^#([a-fA-F0-9]{6})$"
            }
          }
        }
      ]
    },
    "widthType": {
      "oneOf": [
        {
          "type": "number",
          "minimum": 0,
          "maximum": 8,
          "multipleOf": 0.125
        },
        {
          "type": "object",
          "propertyNames": {
            "$ref": "#/$defs/zoomKeys"
          },
          "patternProperties": {
            ".*": {
              "type": "number",
              "minimum": 0,
              "maximum": 8,
              "multipleOf": 0.125
            }
          }
        }
      ]
    },
    "alphaType": {
      "oneOf": [
        {
          "type": "number",
          "minimum": 0,
          "maximum": 1,
          "multipleOf": 0.01
        },
        {
          "type": "object",
          "propertyNames": {
            "$ref": "#/$defs/zoomKeys"
          },
          "patternProperties": {
            ".*": {
              "type": "number",
              "minimum": 0,
              "maximum": 1,
              "multipleOf": 0.01
            }
          }
        }
      ]
    },
    "zoomKeys": {
      "enum": [
        "z00",
        "z01",
        "z02",
        "z03",
        "z04",
        "z05",
        "z06",
        "z07",
        "z08",
        "z09",
        "z10",
        "z11",
        "z12",
        "z13",
        "z14",
        "z15",
        "z16",
        "z17",
        "z18",
        "z19",
        "z20",
        "z21",
        "z22"
      ]
    }
  },
  "properties": {
    "variant": {
      "type": "string",
      "enum": [
        "light",
        "dark"
      ]
    },
    "backgroundColor": {
      "type": "string",
      "pattern": "^#([a-fA-F0-9]{6})$"
    },
    "monochrome": {
      "type": "boolean"
    },
    "metadata": {
      "type": "object"
    },
    "styles": {
      "type": "array",
      "items": {
        "oneOf": [
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "strokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeWidth": {
                    "$ref": "#/$defs/widthType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.building"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "strokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeWidth": {
                    "$ref": "#/$defs/widthType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.building.commercial"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "strokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeWidth": {
                    "$ref": "#/$defs/widthType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.building.indoor"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "strokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeWidth": {
                    "$ref": "#/$defs/widthType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.businessCorridor"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.railwayTrack"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "strokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeWidth": {
                    "$ref": "#/$defs/widthType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.railwayTrack.commercial"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "strokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeWidth": {
                    "$ref": "#/$defs/widthType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.railwayTrack.commuter"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "strokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeWidth": {
                    "$ref": "#/$defs/widthType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.roadNetwork"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "strokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeWidth": {
                    "$ref": "#/$defs/widthType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.roadNetwork.noTraffic"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "strokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeWidth": {
                    "$ref": "#/$defs/widthType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.roadNetwork.noTraffic.pedestrianMall"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.roadNetwork.noTraffic.trail"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "strokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeWidth": {
                    "$ref": "#/$defs/widthType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.roadNetwork.noTraffic.trail.paved"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "strokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeWidth": {
                    "$ref": "#/$defs/widthType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.roadNetwork.noTraffic.trail.unpaved"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "strokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeWidth": {
                    "$ref": "#/$defs/widthType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.roadNetwork.parkingAisle"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "strokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeWidth": {
                    "$ref": "#/$defs/widthType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.roadNetwork.ramp"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "strokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeWidth": {
                    "$ref": "#/$defs/widthType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.roadNetwork.road"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "strokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeWidth": {
                    "$ref": "#/$defs/widthType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.roadNetwork.road.arterial"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "strokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeWidth": {
                    "$ref": "#/$defs/widthType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.roadNetwork.road.highway"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "strokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeWidth": {
                    "$ref": "#/$defs/widthType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.roadNetwork.road.local"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "strokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeWidth": {
                    "$ref": "#/$defs/widthType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.roadNetwork.road.noOutlet"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "strokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeWidth": {
                    "$ref": "#/$defs/widthType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.roadNetwork.roadDetail"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.roadNetwork.roadDetail.directionArrow"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.roadNetwork.roadDetail.intersection"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.roadNetwork.roadDetail.marking"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.roadNetwork.roadDetail.marking.crosswalk"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.roadNetwork.roadDetail.sidewalk"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.roadNetwork.roadDetail.surface"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.roadNetwork.roadShield"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.roadNetwork.roadSign"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.transitStation"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.transitStation.bicycleShare"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.transitStation.busStation"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.transitStation.ferryTerminal"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.transitStation.funicularStation"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.transitStation.gondolaStation"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.transitStation.monorail"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.transitStation.railStation"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.transitStation.railStation.subwayStation"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.transitStation.railStation.tramStation"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "infrastructure.urbanArea"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "natural"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "natural.archipelago"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "natural.base"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "natural.continent"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "natural.island"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "natural.land"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "natural.land.landCover"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "natural.land.landCover.crops"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "natural.land.landCover.dryCrops"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "natural.land.landCover.forest"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "natural.land.landCover.ice"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "natural.land.landCover.sand"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "natural.land.landCover.shrub"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "natural.land.landCover.tundra"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "natural.water"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "natural.water.lake"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "natural.water.ocean"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "natural.water.other"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "natural.water.river"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.emergency"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.emergency.fire"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.emergency.hospital"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.emergency.pharmacy"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.emergency.police"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.entertainment"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.entertainment.arts"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.entertainment.casino"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.entertainment.cinema"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.entertainment.historic"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.entertainment.museum"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.entertainment.themePark"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.entertainment.touristAttraction"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.foodAndDrink"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.foodAndDrink.bar"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.foodAndDrink.cafe"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.foodAndDrink.restaurant"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.foodAndDrink.winery"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.landmark"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.lodging"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.other"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.other.bridge"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.other.cemetery"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.other.government"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.other.library"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.other.military"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.other.placeOfWorship"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.other.placeOfWorship.buddhist"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.other.placeOfWorship.christian"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.other.placeOfWorship.hindu"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.other.placeOfWorship.islamic"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.other.placeOfWorship.jain"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.other.placeOfWorship.jewish"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.other.placeOfWorship.shinto"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.other.placeOfWorship.sikh"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.other.school"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.other.townSquare"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.recreation"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.recreation.beach"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.recreation.boating"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.recreation.fishing"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.recreation.golfCourse"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.recreation.hotSpring"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.recreation.natureReserve"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.recreation.park"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.recreation.peak"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.recreation.sportsComplex"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.recreation.sportsField"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.recreation.trailhead"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.recreation.zoo"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.retail"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.retail.grocery"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.retail.shopping"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.service"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.service.atm"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.service.bank"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.service.carRental"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.service.evCharging"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.service.gasStation"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.service.parkingLot"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.service.postOffice"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.service.restroom"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.service.restStop"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.transit"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "pointOfInterest.transit.airport"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinOutlineColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "pinGlyphColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "political"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "political.border"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "color": {
                    "$ref": "#/$defs/colorType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "political.city"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "pinFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "political.countryOrRegion"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "political.landParcel"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "strokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "strokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeWidth": {
                    "$ref": "#/$defs/widthType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "political.neighborhood"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "political.reservation"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "strokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "strokeWidth": {
                    "$ref": "#/$defs/widthType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "political.stateOrProvince"
              },
              "geometry": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "fillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "fillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          },
          {
            "type": "object",
            "additionalProperties": false,
            "required": [
              "id"
            ],
            "properties": {
              "id": {
                "const": "political.sublocality"
              },
              "label": {
                "type": "object",
                "additionalProperties": false,
                "properties": {
                  "visible": {
                    "$ref": "#/$defs/visibilityType"
                  },
                  "textFillColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textFillOpacity": {
                    "$ref": "#/$defs/alphaType"
                  },
                  "textStrokeColor": {
                    "$ref": "#/$defs/colorType"
                  },
                  "textStrokeOpacity": {
                    "$ref": "#/$defs/alphaType"
                  }
                }
              }
            }
          }
        ]
      }
    }
  }
};
