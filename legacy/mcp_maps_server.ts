/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// tslint:disable
import {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
import {Transport} from '@modelcontextprotocol/sdk/shared/transport.js';
import {z} from 'zod';
import {getValidator} from './validator';

export interface MapParams {
  location?: string;
  search?: string;
  origin?: string;
  destination?: string;
  base64StyleTable?: string;
  jsonStyle?: string;
  userFriendlyName?: string;
}

export async function startMcpGoogleMapServer(
  transport: Transport,
  mapQueryHandler: (params: MapParams) => void,
  configVersion: string
) {
  // Create an MCP server
  const server = new McpServer({
    name: 'AI Studio Google Map',
    version: '1.0.0',
  });

  const validator = getValidator();

  server.tool(
    'validate_and_generate',
    'Validate a JSON stylesheet against the schema definition. If successful, generate the style table based on the provided stylesheet',
    {
      publicStyleSheet: z.string(),
      userFriendlyName: z.string()
    },
    async ({publicStyleSheet, userFriendlyName}) => {
      let parsedStyle;
      try {
        parsedStyle = JSON.parse(publicStyleSheet);
      } catch (e) {
        return {content: [{type:'text', text: e.message}]};
      }

      parsedStyle.metadata = {
        'createdBy': 'Maps Styling AI Studio app',
        'createdTime': new Date().toLocaleString(),
      }

      const errors = validator.validate(parsedStyle);

      if (errors.length) {
        return {content: [{type:'text', text: JSON.stringify(errors)}]};
      }

      mapQueryHandler({jsonStyle: JSON.stringify(parsedStyle), userFriendlyName});
      try {
        const base64StyleTable = await fetch('https://mapsresources-pa.googleapis.com/v1/generateStyleTable', {method: 'POST', 
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            'config_version': configVersion,
            'version': 'sdk-',
            'public_style_sheet_json': publicStyleSheet,
            'config_set': 'roadmap',
          })
        }).then(v => v.json())
          .then(obj => obj.styleTable);
        mapQueryHandler({base64StyleTable});
        return {content: [{type: 'text', text: 'success'}]};
      }
      catch (error) {
        return {content: [{type: 'text', text: 'Received error when generating style table, please try again. ' +
          'If the error persists, you may need to try creating a new stylesheet. ' +
          'Error: ' + error.message}]}
      }
    }
  )

  server.tool(
    'view_location_google_maps',
    'View a specific query or geographical location and display in the embedded maps interface',
    {query: z.string()},
    async ({query}) => {
      mapQueryHandler({location: query});
      return {
        content: [{type: 'text', text: `Navigating to: ${query}`}],
      };
    },
  );

  server.tool(
    'search_google_maps',
    'Search google maps for a series of places near a location and display it in the maps interface',
    {search: z.string()},
    async ({search}) => {
      mapQueryHandler({search});
      return {
        content: [{type: 'text', text: `Searching: ${search}`}],
      };
    },
  );

  server.tool(
    'directions_on_google_maps',
    'Search google maps for directions from origin to destination.',
    {origin: z.string(), destination: z.string()},
    async ({origin, destination}) => {
      mapQueryHandler({origin, destination});
      return {
        content: [
          {type: 'text', text: `Navigating from ${origin} to ${destination}`},
        ],
      };
    },
  );

  await server.connect(transport);
  while (true) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}
