import { ApiProperty } from '@nestjs/swagger';

export class MoveDto {
  @ApiProperty({
    example: 'e2',
    description: 'Casa de origem do movimento no formato de notação algébrica',
  })
  from: string;

  @ApiProperty({
    example: 'e4',
    description: 'Casa de destino do movimento no formato de notação algébrica',
  })
  to: string;

  @ApiProperty({
    example: 'p',
    description:
      'A peça movida (p, n, b, r, q, k) em notação FEN (minúsculas para preto, maiúsculas para branco)',
  })
  piece: string;

  @ApiProperty({
    required: false,
    example: 'q',
    description: 'Peça promovida, se for um movimento de promoção (q, r, b, n)',
  })
  promotion?: string;
}
