import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import * as sqlite3 from 'sqlite3';
import * as path from 'path';
import * as fs from 'fs';

export class SqliteNode implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'SQLite Node',
		name: 'SqliteNode',
		icon: 'file:sqlite-icon.svg',
		group: ['transform'],
		version: 1,
		description: 'A node to perform query in a local SQLite database',
		defaults: {
			name: 'Sqlite Node',
		},
		inputs: ['main'],
		outputs: ['main'],
		properties: [
			{
				displayName: 'Database Name',
				name: 'dbName',
				type: 'string',
				default: '',
				placeholder: 'my_database',
				description: 'Name of the database file (without .db extension)',
				required: true,
			},
			{
				displayName: 'Query Type',
				name: 'query_type',
				type: 'options',
				default: 'AUTO',
				noDataExpression: true,
				required: true,
				options: [
					{ name: 'AUTO', value: 'AUTO', description: 'Automatically detect query type' },
					{ name: 'CREATE', value: 'CREATE', description: 'Create a table' },
					{ name: 'DELETE', value: 'DELETE', description: 'Delete rows from a table' },
					{ name: 'INSERT', value: 'INSERT', description: 'Insert rows into a table' },
					{ name: 'SELECT', value: 'SELECT', description: 'Select rows from a table' },
					{ name: 'UPDATE', value: 'UPDATE', description: 'Update rows in a table' },
					{ name: 'Delete Database', value: 'DELETE_DATABASE', description: 'Delete the database file' },
				],
			},
			{
				displayName: 'Query',
				name: 'query',
				type: 'string',
				default: '',
				placeholder: 'SELECT * FROM table where key = $key',
				description: 'The query to execute',
				required: true,
				typeOptions: {
					rows: 8,
				},
			},
			{
				displayName: 'Args',
				name: 'args',
				type: 'json',
				default: '{}',
				placeholder: '{"$key": "value"}',
				description: 'The args that get passed to the query',
			},
			{
				displayName: 'Spread Result',
				name: 'spread',
				type: 'boolean',
				default: false,
				description: 'Whether the result should be spread into multiple items',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		let spreadResults: INodeExecutionData[] = [];

		const workflowInfo = this.getWorkflow();
		const workflowId = workflowInfo?.id || 'default_workflow';

		const workflowDir = path.resolve('./databases', workflowId);
		if (!fs.existsSync(workflowDir)) {
			fs.mkdirSync(workflowDir, { recursive: true });
		}

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const dbName = this.getNodeParameter('dbName', itemIndex, '') as string;
				const queryType = this.getNodeParameter('query_type', itemIndex, 'AUTO') as string;

				const dbPath = path.join(workflowDir, `${dbName}.db`);

				if (queryType === 'DELETE_DATABASE') {
					if (fs.existsSync(dbPath)) {
						fs.unlinkSync(dbPath);
						items[itemIndex].json = { success: true, message: `Database ${dbName} deleted successfully.` };
					} else {
						items[itemIndex].json = { success: false, message: `Database ${dbName} does not exist.` };
					}
					continue;
				}

				const query = this.getNodeParameter('query', itemIndex, '') as string;
				const argsString = this.getNodeParameter('args', itemIndex, '{}') as string;
				const args = JSON.parse(argsString);

				const db = new sqlite3.Database(dbPath);

				const results = await new Promise<any[]>((resolve, reject) => {
					if (queryType === 'SELECT') {
						db.all(query, args, (error, rows) => (error ? reject(error) : resolve(rows)));
					} else {
						db.run(query, args, (error) => {
							if (error) return reject(error);
							resolve([{ changes: 1 }]);
						});
					}
				});

				if (queryType === 'SELECT') {
					results.forEach((result) => spreadResults.push({ json: result }));
				} else {
					items[itemIndex].json = results[0];
				}

				db.close();
			} catch (error) {
				if (this.continueOnFail()) {
					items[itemIndex].json = { error: error.message };
				} else {
					throw error;
				}
			}
		}

		return spreadResults.length > 0 ? this.prepareOutputData(spreadResults) : this.prepareOutputData(items);
	}
}
