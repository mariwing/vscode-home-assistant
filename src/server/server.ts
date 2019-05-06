import { createConnection, TextDocuments, ProposedFeatures, ServerCapabilities } from "vscode-languageserver";
import { VsCodeFileAccessor } from "./fileAccessor";
import { HomeAssistantLanguageService } from "./haLanguageService";
import { HaConnection } from "./home-assistant/haConnection";
import { YamlLanguageServiceWrapper } from "./yamlLanguageServiceWrapper";
import { EntityIdCompletionContribution } from "./completionHelpers/entityIds";
import { ConfigurationService } from "./configuration";
import { ServicesCompletionContribution } from "./completionHelpers/services";
import { YamlIncludeDiscovery } from "./yamlIncludes/discovery";
import { DefinitionProvider } from "./definition";

let connection = createConnection(ProposedFeatures.all);

console.log = connection.console.log.bind(connection.console);
console.error = connection.console.error.bind(connection.console);

let documents = new TextDocuments();
documents.listen(connection);

connection.onInitialize(async params => {

  connection.console.log(`[Server(${process.pid})] Started and initialize received`);

  var configurationService = new ConfigurationService();
  var haConnection = new HaConnection(configurationService);
  var vsCodeFileAccessor = new VsCodeFileAccessor(params.rootUri, connection);
  var yamlIncludeDiscovery = new YamlIncludeDiscovery(vsCodeFileAccessor);
  var definitionProvider = new DefinitionProvider(vsCodeFileAccessor);

  var yamlLanguageServiceWrapper = new YamlLanguageServiceWrapper([
    new EntityIdCompletionContribution(haConnection),
    new ServicesCompletionContribution(haConnection)
  ]);

  var homeAsisstantLanguageService = new HomeAssistantLanguageService(
    documents,
    yamlLanguageServiceWrapper,
    yamlIncludeDiscovery,
    haConnection,
    definitionProvider
  );

  await homeAsisstantLanguageService.triggerSchemaLoad();

  documents.onDidChangeContent((e) => homeAsisstantLanguageService.getDiagnostics(e, connection));
  documents.onDidOpen((e) => homeAsisstantLanguageService.getDiagnostics(e, connection));

  connection.onDocumentSymbol(homeAsisstantLanguageService.onDocumentSymbol);
  connection.onDocumentFormatting(homeAsisstantLanguageService.onDocumentFormatting);
  connection.onCompletion(homeAsisstantLanguageService.onCompletion);
  connection.onCompletionResolve(homeAsisstantLanguageService.onCompletionResolve);
  connection.onHover(homeAsisstantLanguageService.onHover);
  connection.onDefinition(homeAsisstantLanguageService.onDefinition);
  connection.onDidChangeWatchedFiles(homeAsisstantLanguageService.onDidChangeWatchedFiles);

  connection.onDidChangeConfiguration(async (config) => {
    configurationService.updateConfiguration(config);
    await haConnection.notifyConfigUpdate();

    if (!configurationService.isConfigured) {
      connection.sendNotification("no-config");
    }
  });

  return {
    capabilities: <ServerCapabilities>{
      textDocumentSync: documents.syncKind,
      completionProvider: { triggerCharacters: [" "], resolveProvider: true },
      hoverProvider: true,
      documentSymbolProvider: true,
      documentFormattingProvider: true,
      definitionProvider: true
    }
  };
});

connection.listen();