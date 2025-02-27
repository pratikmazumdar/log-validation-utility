import map from 'lodash.map'
import { merge } from 'lodash'
import { ObjectSchema } from 'joi'

export const validate = async (schema: ObjectSchema, payload: Record<string, string>) => {
  try {
    await schema.validateAsync(payload, {
      abortEarly: false,
    })
  } catch (error: any) {
    const transformed = map(error.details, (item) => {
      const key = item.path[0]
      const value = item.message.replaceAll('\"', "'")
      return { [key]: value }
    })

    const response = merge([...transformed])
    return response
  }
}
