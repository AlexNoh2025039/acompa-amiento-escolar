export type PracticeQuestion = {
  id: string
  prompt: string
  options: string[]
  correctIndex: number
  explanation: string
}

const mathQuestionsByGrade: Record<number, [string, string[], number, string][]> = {
  1: [
    ['¿Cuánto es 1 + 1?', ['1', '2', '3', '4'], 1, 'Si juntas un objeto y otro, tienes dos objetos.'],
    ['Tienes 3 manzanas y recibes 2 más. ¿Cuántas tienes?', ['4', '5', '6', '7'], 1, 'Contar 2 después del 3 nos lleva a 5.'],
    ['¿Cuánto es 5 - 2?', ['2', '3', '4', '7'], 1, 'Si quitas 2 de 5, quedan 3.'],
    ['¿Cuál número es mayor?', ['2', '5', '3', '1'], 1, 'Al contar, 5 aparece después de 2, 3 y 1.'],
    ['¿Cuánto falta para que 4 llegue a 6?', ['1', '2', '3', '4'], 1, 'Después de 4 vienen 5 y 6: faltan dos pasos.'],
  ],
  2: [
    ['¿Cuánto es 26 + 13?', ['29', '39', '40', '49'], 1, 'Suma decenas y unidades: 20 + 10 y 6 + 3.'],
    ['¿Cuánto es 48 - 15?', ['23', '33', '43', '63'], 1, 'Quita primero 10 y luego 5: quedan 33.'],
    ['En 53, ¿cuántas decenas hay?', ['3', '5', '53', '50'], 1, 'El 5 está en el lugar de las decenas: son cinco decenas.'],
    ['¿Cuánto es 2 + 2 + 2?', ['4', '5', '6', '8'], 2, 'Puedes contar de dos en dos: 2, 4, 6.'],
    ['¿Cuál es la mitad de 10?', ['2', '4', '5', '8'], 2, 'Diez repartido en dos grupos iguales da cinco en cada grupo.'],
  ],
  3: [
    ['¿Cuánto es 66 + 33?', ['89', '98', '99', '109'], 2, '60 + 30 = 90 y 6 + 3 = 9; en total 99.'],
    ['¿Cuánto es 100 - 46?', ['44', '54', '64', '56'], 1, '100 menos 40 es 60; menos 6 es 54.'],
    ['¿Cuánto es 6 × 4?', ['10', '20', '24', '28'], 2, 'Seis grupos de cuatro suman 24.'],
    ['¿Cuánto es 35 + 28?', ['53', '63', '73', '62'], 1, '30 + 20 = 50 y 5 + 8 = 13; total 63.'],
    ['¿Cuánto es 42 ÷ 6?', ['6', '7', '8', '9'], 1, 'Como 6 × 7 = 42, el cociente es 7.'],
  ],
  4: [
    ['¿Cuánto es 2 × 12?', ['14', '22', '24', '26'], 2, 'Dos grupos de doce suman 24.'],
    ['¿Cuánto es 72 ÷ 8?', ['8', '9', '10', '12'], 1, 'Ocho por nueve es 72.'],
    ['¿Cuánto es 24 × 3?', ['62', '72', '74', '82'], 1, '20 × 3 = 60 y 4 × 3 = 12; total 72.'],
    ['¿Cuánto es 125 - 48?', ['67', '73', '77', '83'], 2, '125 menos 40 es 85; menos 8 es 77.'],
    ['¿Cuánto es 144 ÷ 12?', ['10', '11', '12', '14'], 2, '12 × 12 = 144, así que el cociente es 12.'],
  ],
  5: [
    ['¿Cuánto es 1/2 + 1/4?', ['1/4', '2/6', '3/4', '1'], 2, 'La mitad equivale a 2/4; 2/4 + 1/4 = 3/4.'],
    ['¿Cuánto es 3/5 de 20?', ['8', '10', '12', '15'], 2, '20 ÷ 5 = 4 y 4 × 3 = 12.'],
    ['¿Cuál es la raíz cuadrada de 49?', ['6', '7', '8', '9'], 1, '7 × 7 = 49, por eso su raíz cuadrada es 7.'],
    ['¿Cuánto es 2.5 + 1.25?', ['3.25', '3.5', '3.75', '4.25'], 2, 'Alinea los decimales: 2.50 + 1.25 = 3.75.'],
    ['¿Cuánto es 144 ÷ 12?', ['10', '11', '12', '14'], 2, '12 grupos de 12 forman 144.'],
  ],
  6: [
    ['¿Cuánto es 2/3 de 30?', ['10', '15', '20', '25'], 2, '30 ÷ 3 = 10 y 10 × 2 = 20.'],
    ['¿Cuál es la raíz cuadrada de 144?', ['10', '11', '12', '14'], 2, '12 × 12 = 144.'],
    ['¿Cuánto es 3/4 + 1/8?', ['4/12', '5/8', '7/8', '1'], 2, '3/4 equivale a 6/8; 6/8 + 1/8 = 7/8.'],
    ['¿Cuánto es 2.5 × 4?', ['8', '9', '10', '12'], 2, '25 décimos por 4 son 100 décimos, es decir, 10.'],
    ['Si 3x + 5 = 20, ¿cuánto vale x?', ['3', '5', '7', '15'], 1, 'Resta 5 a ambos lados: 3x = 15; luego x = 5.'],
  ],
}

const scienceQuestionsByBand: Record<1 | 2 | 3, [string, string[], number, string][]> = {
  1: [
    ['¿Qué necesitan las plantas para crecer?', ['Luz y agua', 'Hielo y aceite', 'Solo piedras', 'Jabón y arena'], 0, 'La luz y el agua ayudan a las plantas a crecer.'],
    ['¿Qué animal es un mamífero?', ['Trucha', 'Rana', 'Gato', 'Mariposa'], 2, 'Los gatos son mamíferos y alimentan a sus crías con leche.'],
    ['¿En qué estado está el hielo?', ['Líquido', 'Sólido', 'Gaseoso', 'Plasma'], 1, 'El hielo es agua en estado sólido.'],
    ['¿Cuál es una fuente de luz natural?', ['Una linterna', 'Una vela', 'El Sol', 'Una pantalla'], 2, 'El Sol produce luz de forma natural.'],
    ['¿Qué parte de la planta absorbe agua del suelo?', ['La raíz', 'La flor', 'El fruto', 'La hoja'], 0, 'Las raíces sujetan la planta y absorben agua del suelo.'],
  ],
  2: [
    ['¿Qué cambio ocurre cuando un charco desaparece con el calor?', ['Se congela', 'Se evapora', 'Se convierte en piedra', 'Se derrite el suelo'], 1, 'El calor transforma parte del agua líquida en vapor: eso es evaporación.'],
    ['¿Qué ser vivo suele iniciar una cadena alimentaria?', ['Una planta', 'Un hongo', 'Un zorro', 'Un águila'], 0, 'Las plantas producen su alimento y pueden alimentar a otros seres vivos.'],
    ['¿Qué órgano bombea la sangre?', ['El estómago', 'El corazón', 'El pulmón', 'El cerebro'], 1, 'El corazón impulsa la sangre por el cuerpo.'],
    ['¿Qué movimiento de la Tierra produce el día y la noche?', ['La rotación', 'La lluvia', 'La traslación de la Luna', 'El viento'], 0, 'La Tierra gira sobre sí misma; por eso alternan el día y la noche.'],
    ['¿Qué material suele conducir bien la electricidad?', ['Cobre', 'Madera seca', 'Plástico', 'Goma'], 0, 'El cobre es un metal que permite el paso de la corriente eléctrica.'],
  ],
  3: [
    ['Durante la fotosíntesis, ¿qué gas del aire usa la planta?', ['Dióxido de carbono', 'Helio', 'Hidrógeno', 'Neón'], 0, 'La planta toma dióxido de carbono y, con agua y luz, produce azúcares.'],
    ['¿Cuál es la unidad básica que forma a los seres vivos?', ['La célula', 'El planeta', 'El mineral', 'La nube'], 0, 'La célula es la unidad más pequeña que realiza las funciones de la vida.'],
    ['¿Qué puede ayudar a mantener estable un ecosistema?', ['La diversidad de especies', 'Eliminar todos los depredadores', 'Contaminar el agua', 'Quitar todas las plantas'], 0, 'La biodiversidad ayuda a que los ecosistemas tengan relaciones variadas y resistentes.'],
    ['¿Qué proceso convierte el vapor de agua en gotas?', ['Condensación', 'Fusión', 'Combustión', 'Disolución'], 0, 'Al enfriarse, el vapor se condensa y forma gotas de agua.'],
    ['¿Qué fuerza suele oponerse al deslizamiento entre dos superficies?', ['Fricción', 'Magnetismo', 'Flotación', 'Luz'], 0, 'La fricción actúa entre superficies en contacto y se opone al movimiento.'],
  ],
}

const languageQuestionsByBand: Record<1 | 2 | 3, [string, string[], number, string][]> = {
  1: [
    ['¿Cuál de estas letras es una vocal?', ['M', 'A', 'T', 'S'], 1, 'A es una de las cinco vocales: a, e, i, o, u.'],
    ['¿Cuántas sílabas tiene “casa”?', ['Una', 'Dos', 'Tres', 'Cuatro'], 1, 'Ca-sa tiene dos golpes de voz, por eso tiene dos sílabas.'],
    ['¿Con qué letra comienza una oración?', ['Mayúscula', 'Minúscula siempre', 'Número', 'Signo de cierre'], 0, 'La primera palabra de una oración empieza con mayúscula.'],
    ['¿Qué signo cierra esta pregunta: “¿Cómo te llamas__”?', ['.', '?', '!', ','], 1, 'En español las preguntas comienzan con ¿ y terminan con ?.'],
    ['¿Cuál palabra nombra un animal?', ['Saltar', 'Suave', 'Perro', 'Ayer'], 2, 'Perro nombra un animal; es un sustantivo.'],
  ],
  2: [
    ['¿Cuál palabra expresa una acción?', ['Ventana', 'Saltar', 'Verde', 'Despacio'], 1, 'Saltar es un verbo porque expresa una acción.'],
    ['En “la mochila pesada”, ¿qué palabra describe a la mochila?', ['La', 'Mochila', 'Pesada', 'Ninguna'], 2, 'Pesada es un adjetivo que indica una característica de la mochila.'],
    ['¿Cuál es el plural correcto de “lápiz”?', ['Lápizes', 'Lápices', 'Lápizs', 'Lápiz'], 1, 'Las palabras terminadas en z cambian a c antes de añadir -es.'],
    ['¿Qué signo se usa al inicio de una pregunta en español?', ['¡', '¿', '…', ';'], 1, 'En español usamos el signo de apertura ¿ al inicio de las preguntas.'],
    ['¿Qué expresa la idea principal de un texto?', ['El tema más importante', 'El número de letras', 'El color de la página', 'El nombre de la imprenta'], 0, 'La idea principal comunica lo más importante de lo que se lee.'],
  ],
  3: [
    ['¿Cuál palabra es un pronombre que puede reemplazar a “Lucía y yo”?', ['Nosotras', 'Ellos', 'Ustedes', 'Tú'], 0, 'Nosotras reemplaza a un grupo que incluye a quien habla y está formado por mujeres.'],
    ['¿Qué palabra es el sujeto de “Los estudiantes prepararon una exposición”?', ['Prepararon', 'Una exposición', 'Los estudiantes', 'Exposición'], 2, 'Los estudiantes realizan la acción indicada por el verbo.'],
    ['¿Cuál palabra es aguda y lleva tilde correctamente?', ['Canción', 'Mesa', 'Árboles', 'Joven'], 0, 'Canción es aguda y termina en n, por eso lleva tilde.'],
    ['¿Qué palabra une dos ideas en “Quería salir, pero estaba lloviendo”?', ['Quería', 'Salir', 'Pero', 'Lloviendo'], 2, 'Pero es una conjunción que conecta ideas opuestas.'],
    ['¿Cuál es el propósito principal de un texto argumentativo?', ['Defender una opinión con razones', 'Dar instrucciones para armar algo', 'Contar una lista de personajes', 'Describir solo un paisaje'], 0, 'Un texto argumentativo presenta una postura y razones para apoyarla.'],
  ],
}

export function practiceQuestions(subjectName: string, grade: string): PracticeQuestion[] | null {
  const normalized = subjectName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const gradeNumber = Number(grade.match(/\d+/)?.[0] ?? 1)
  const level = Math.min(6, Math.max(1,
    gradeNumber + (/secundaria/i.test(grade) ? 6 : /prepa|bachillerato|high school/i.test(grade) ? 9 : 0),
  ))
  const gradeBand = Math.ceil(level / 2) as 1 | 2 | 3
  const source = normalized.includes('matemat') || normalized.includes('math')
    ? mathQuestionsByGrade[level]
    : normalized.includes('cien') || normalized.includes('biolog')
      ? scienceQuestionsByBand[gradeBand]
      : normalized.includes('espanol') || normalized.includes('lectura') || normalized.includes('lengua')
        ? languageQuestionsByBand[gradeBand]
        : null
  if (!source) return null
  return source.map(([prompt, options, correctIndex, explanation], index) => ({
    id: `${normalized}-${level}-${index + 1}`,
    prompt,
    options,
    correctIndex,
    explanation,
  }))
}
