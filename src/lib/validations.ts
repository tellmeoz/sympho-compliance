import { z } from 'zod';

// Expresión regular para RFC de Persona Física y Moral
export const RFC_REGEX = /^[A-Z&Ññ]{3,4}[0-9]{6}[A-Z0-9]{3}$/;

// Expresión regular para CURP
export const CURP_REGEX = /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[A-Z0-9]{2}$/;

// Tipos MIME y tamaños límites para documentos
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
export const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

/**
 * Esquema de validación para un donante (KYC Completo)
 */
export const DonorSchema = z.object({
  name: z.string().min(3, 'El nombre o razón social debe tener al menos 3 caracteres'),
  rfc: z.string().regex(RFC_REGEX, 'El RFC ingresado no tiene un formato válido en México'),
  type: z.enum(['Persona Física', 'Persona Moral']),
  curp: z.string().regex(CURP_REGEX, 'El CURP ingresado no es válido').optional().or(z.literal('')),
  dob_or_constitution: z.string().refine((val) => {
    const date = new Date(val);
    return date <= new Date();
  }, 'La fecha de nacimiento o constitución no puede estar en el futuro'),
  email: z.string().email('El correo electrónico no tiene un formato válido').optional().or(z.literal('')),
  phone: z.string().min(10, 'El teléfono debe tener al menos 10 dígitos').optional().or(z.literal('')),
  
  // Domicilio Fiscal
  address_street: z.string().min(1, 'La calle es obligatoria'),
  address_number_ext: z.string().min(1, 'El número exterior es obligatorio'),
  address_number_int: z.string().optional().or(z.literal('')),
  address_colony: z.string().min(1, 'La colonia es obligatoria'),
  address_city: z.string().min(1, 'El municipio/alcaldía es obligatorio'),
  address_state: z.string().min(1, 'El estado es obligatorio'),
  address_zip: z.string().length(5, 'El código postal debe tener exactamente 5 dígitos'),
  
  economic_activity: z.string().min(3, 'La actividad económica es obligatoria'),
  funds_origin: z.string().min(5, 'Debe especificar la procedencia declarada de los fondos'),
  
  // Datos del Representante Legal (Requerido condicionalmente para Personas Morales)
  representative_name: z.string().optional().or(z.literal('')),
  representative_rfc: z.string().regex(RFC_REGEX, 'RFC del representante no es válido').optional().or(z.literal('')),
  representative_curp: z.string().regex(CURP_REGEX, 'CURP del representante no es válido').optional().or(z.literal('')),
  
  beneficiary_controller_info: z.string().optional().or(z.literal('')),
  risk: z.enum(['Bajo', 'Medio', 'Alto']).default('Bajo'),
  notes: z.string().optional().or(z.literal(''))
}).superRefine((data, ctx) => {
  // Validación condicional para Personas Morales
  if (data.type === 'Persona Moral') {
    if (!data.representative_name || data.representative_name.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['representative_name'],
        message: 'El nombre del representante legal es obligatorio para personas morales',
      });
    }
    if (!data.representative_rfc || !RFC_REGEX.test(data.representative_rfc)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['representative_rfc'],
        message: 'El RFC del representante legal es obligatorio y válido para personas morales',
      });
    }
  }
});

/**
 * Esquema de validación para una donación
 */
export const DonationSchema = z.object({
  donor_id: z.string().uuid('ID de donante inválido'),
  amount: z.number().positive('El monto de la donación debe ser mayor a cero'),
  date: z.string().refine((val) => {
    const date = new Date(val);
    return date <= new Date();
  }, 'La fecha de la donación no puede ser futura'),
  method: z.enum(['Efectivo', 'Transferencia', 'Tarjeta', 'Cheque', 'Otro']),
  campaign: z.string().min(3, 'El nombre de la campaña debe tener al menos 3 caracteres'),
  status: z.enum(['Validada', 'Retenida']).default('Validada')
});

/**
 * Esquema de validación para credenciales de acceso (Login)
 */
export const LoginSchema = z.object({
  email: z.string().email('El correo electrónico no tiene un formato válido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres')
});

/**
 * Esquema de validación para aprovisionamiento inicial (Bootstrap)
 */
export const BootstrapSchema = z.object({
  email: z.string().email('El correo electrónico no tiene un formato válido'),
  password: z.string().min(6, 'La contraseña debe tener al menos 6 caracteres'),
  org_name: z.string().min(3, 'El nombre de la organización debe tener al menos 3 caracteres'),
  org_rfc: z.string().regex(RFC_REGEX, 'El RFC de la organización no es válido')
});

/**
 * Esquema de validación para resolución de alertas
 */
export const AlertResolutionSchema = z.object({
  notes: z.string().min(5, 'Debe especificar notas de investigación del oficial de cumplimiento de al menos 5 caracteres')
});

/**
 * Esquema de validación para agregar a la lista de bloqueados
 */
export const BlacklistSchema = z.object({
  name: z.string().min(3, 'El nombre debe tener al menos 3 caracteres'),
  rfc: z.string().regex(RFC_REGEX, 'El RFC ingresado no es válido').optional().or(z.literal('')),
  reason: z.string().min(5, 'Debe especificar el motivo del bloqueo de al menos 5 caracteres')
});
