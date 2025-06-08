import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MoveDto } from '../game/dto/move.dto';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly apiKey: string;
  private readonly modelName: string;
  private readonly apiUrl: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('GEMINI_API_KEY');
    this.modelName =
      this.configService.get<string>('GEMINI_MODEL_NAME') ||
      'gemini-2.5-flash-preview-04-17';

    this.apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;

    if (!this.apiKey) {
      this.logger.error(
        'GEMINI_API_KEY não encontrada na configuração. A funcionalidade de IA não estará disponível.',
      );
    } else {
      this.logger.log(`IA configurada com o modelo Gemini: ${this.modelName}`);
      if (this.modelName === 'gemini-2.5-flash') {
        this.logger.warn(
          `O modelo '${this.modelName}' pode não ser compatível com a API v1beta ou pode não estar disponível. ` +
            `Considere usar 'gemini-pro' ou verificar a documentação da API Gemini para modelos suportados e suas versões de API.`,
        );
      }
    }
  }

  async getAIMove(
    fen: string,
    playerColor: 'w' | 'b',
    aiColor: 'w' | 'b',
    maxRetries = 3, // Número máximo de tentativas
  ): Promise<{ aiMove: MoveDto | null; chatMessage?: string }> {
    if (!this.apiKey || !this.modelName) {
      this.logger.error(
        'A chave da API ou o nome do modelo Gemini não está configurado. Não é possível solicitar o movimento da IA.',
      );
      return {
        aiMove: null,
        chatMessage:
          'Erro: Chave ou modelo da API da IA não configurados no servidor.',
      };
    }

    let retryCount = 0;

    while (retryCount < maxRetries) {
      try {
        const prompt = `
VOCÊ É A INTELIGÊNCIA ARTIFICIAL DO JOGO (Peças ${aiColor === 'w' ? 'BRANCAS' : 'PRETAS'})
e DEVE responder APENAS com um movimento válido no formato JSON abaixo,
mesmo que seja seu primeiro turno ou não seja tecnicamente seu turno no FEN:

{
  "move": { "from": "a2", "to": "a4" }, // Exemplo para peças brancas
  "chat": "Comentário opcional"
}

REGRAS:
1. Você SEMPRE joga com as peças ${aiColor === 'w' ? 'brancas' : 'pretas'}.
2. Ignore o turno no FEN - assuma que é sua vez.
3. Movimento deve ser válido para suas peças.

FEN atual: ${fen}
Sua cor: ${aiColor}
Peças disponíveis: ${aiColor === 'w' ? 'Peões na 2ª linha' : 'Peões na 7ª linha'}
`;

        this.logger.log(
          `Solicitando movimento da IA para FEN: ${fen} usando modelo ${this.modelName} (Tentativa ${retryCount + 1}/${maxRetries})`,
        );

        const response = await fetch(this.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
        });

        const responseData = await response.json();
        this.logger.debug('Resposta da API Gemini recebida:', responseData);

        const generatedText =
          responseData.candidates?.[0]?.content?.parts?.[0]?.text;

        // Adiciona optional chaining para evitar erro se generatedText for undefined
        const jsonMatch = generatedText?.match(/\{.*\}/s);
        if (jsonMatch?.[0]) {
          let aiResponse;
          try {
            aiResponse = JSON.parse(jsonMatch[0]);
          } catch (parseError) {
            this.logger.error(
              `Tentativa ${retryCount + 1}: Erro ao analisar a resposta JSON do Gemini:`,
              parseError,
              'Texto gerado:',
              generatedText,
            );
            retryCount++;
            continue; // Tenta novamente
          }

          if (aiResponse.move) {
            return {
              aiMove: {
                from: aiResponse.move.from,
                to: aiResponse.move.to,
                piece: aiColor === 'w' ? 'P' : 'p', // Usa a cor da IA passada
                color: aiColor, // Usa a cor da IA passada
                promotion: aiResponse.move.promotion || undefined,
              },
              chatMessage: aiResponse.chat,
            };
          }
        }

        retryCount++;
        this.logger.warn(
          `Tentativa ${retryCount}: Resposta inválida ou movimento não encontrado. Tentando novamente...`,
        );
      } catch (error) {
        retryCount++;
        this.logger.error(
          `Tentativa ${retryCount} falhou devido a erro de rede ou API:`,
          error,
        );
      }
    }

    return {
      aiMove: null,
      chatMessage:
        'A IA não conseguiu gerar um movimento válido após várias tentativas.',
    };
  }

  async getInitialMessage(playerColor: 'w' | 'b'): Promise<string | null> {
    this.logger.log(
      `Gerando mensagem inicial da IA para o jogador como ${playerColor} usando o modelo ${this.modelName}`,
    );

    if (!this.apiKey || !this.modelName) {
      this.logger.error(
        'A chave da API ou o nome do modelo Gemini não está configurado. Não é possível gerar mensagem inicial da IA.',
      );
      return 'Erro: Chave ou modelo da API da IA não configurados no servidor.';
    }

    const prompt = `
Você é uma IA de xadrez. Uma nova partida contra um jogador humano acabou de começar.
Gere uma breve e amigável mensagem para iniciar a conversa no chat.
O jogador humano está jogando com as peças ${playerColor === 'w' ? 'brancas' : 'pretas'}.
Responda APENAS com o texto da mensagem. Não inclua formatação extra.
`;
    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Erro da API Gemini (mensagem inicial): ${response.status} - ${errorText}`,
        );
        return 'Olá! Boa sorte na partida.';
      }

      const responseData = await response.json();
      const generatedText =
        responseData.candidates?.[0]?.content?.parts?.[0]?.text;
      return generatedText || 'Olá! Que a melhor jogada vença.';
    } catch (error) {
      this.logger.error(
        'Erro ao chamar a API Gemini para mensagem inicial:',
        error,
      );
      return 'Olá! Ocorreu um erro, mas estou pronto para jogar.';
    }
  }

  async getChatResponse(message: string): Promise<string | null> {
    if (!this.apiKey || !this.modelName) {
      this.logger.error(
        'A chave da API ou o nome do modelo Gemini não está configurado. Não é possível solicitar resposta da IA.',
      );
      return null;
    }

    const prompt = `
Você é uma IA de xadrez jogando uma partida. Um jogador humano acabou de enviar a seguinte mensagem no chat:
"${message}"
Responda de forma breve e amigável, como se estivesse conversando durante a partida.
Responda APENAS com o texto da mensagem. Não inclua formatação extra.
`;

    try {
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Erro da API Gemini (chat): ${response.status} - ${errorText}`,
        );
        return null;
      }

      const responseData = await response.json();
      const generatedText =
        responseData.candidates?.[0]?.content?.parts?.[0]?.text;
      return generatedText || 'Desculpe, não entendi. Poderia repetir?';
    } catch (error) {
      this.logger.error('Erro ao chamar a API Gemini para chat:', error);
      return null;
    }
  }

  // TODO: Add method to convert moves history to FEN
}
