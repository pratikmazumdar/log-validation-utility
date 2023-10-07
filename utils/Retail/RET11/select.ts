import { getValue, setValue } from '../../../shared/dao'
import constants, { ApiSequence } from '../../../constants'
import { validateSchema, isObjectEmpty, checkContext, isoDurToSec } from '../..'
import _ from 'lodash'
import { logger } from '../../../shared/logger'

const tagFinder = (item: { tags: any[] }, value: string): any => {
  const res = item.tags.find((tag: any) => {
    return (
      tag.code === 'type' &&
      tag.list &&
      tag.list.find((listItem: any) => {
        return listItem.code === 'type' && listItem.value == value
      })
    )
  })
  return res
}

export const checkSelect = (data: any, msgIdSet: any) => {
  if (!data || isObjectEmpty(data)) {
    return { [ApiSequence.SELECT]: 'Json cannot be empty' }
  }

  const { message, context } = data
  if (!message || !context || !message.order || isObjectEmpty(message) || isObjectEmpty(message.order)) {
    return { missingFields: '/context, /message, /order or /message/order is missing or empty' }
  }

  const schemaValidation = validateSchema('RET11', constants.RET_SELECT, data)

  const contextRes: any = checkContext(context, constants.RET_SELECT)
  msgIdSet.add(context.message_id)

  const errorObj: any = {}
  let selectedPrice = 0
  const itemsIdList: any = {}
  const itemsCtgrs: any = {}
  const itemsTat: any[] = []

  if (schemaValidation !== 'error') {
    Object.assign(errorObj, schemaValidation)
  }

  if (!contextRes?.valid) {
    Object.assign(errorObj, contextRes.ERRORS)
  }

  setValue(`${ApiSequence.SELECT}`, data)

  const searchContext: any = getValue(`${ApiSequence.SEARCH}_context`)
  const onSearchContext: any = getValue(`${ApiSequence.ON_SEARCH}_context`)

  try {
    logger.info(`Comparing city of /${constants.RET_SEARCH} and /${constants.RET_SELECT}`)
    if (!_.isEqual(searchContext.city, context.city)) {
      const key = `${ApiSequence.SEARCH}_city`
      errorObj[key] = `City code mismatch in /${ApiSequence.SEARCH} and /${ApiSequence.SELECT}`
    }
  } catch (error: any) {
    logger.info(`Error while comparing city in /${ApiSequence.SEARCH} and /${ApiSequence.SELECT}, ${error.stack}`)
  }

  try {
    logger.info(`Comparing city of /${constants.RET_ONSEARCH} and /${constants.RET_SELECT}`)
    if (!_.isEqual(onSearchContext.city, context.city)) {
      const key = `${ApiSequence.ON_SEARCH}_city`
      errorObj[key] = `City code mismatch in /${ApiSequence.ON_SEARCH} and /${ApiSequence.SELECT}`
    }
  } catch (error: any) {
    logger.info(`Error while comparing city in /${ApiSequence.SEARCH} and /${ApiSequence.SELECT}, ${error.stack}`)
  }

  try {
    logger.info(`Comparing timestamp of /${constants.RET_ONSEARCH} and /${constants.RET_SELECT}`)
    if (_.gte(onSearchContext.timestamp, context.timestamp)) {
      errorObj.tmpstmp = `Timestamp for /${constants.RET_ONSEARCH} api cannot be greater than or equal to /${constants.RET_SELECT} api`
    }

    setValue('tmpstmp', context.timestamp)
  } catch (error: any) {
    logger.info(
      `Error while comparing timestamp for /${constants.RET_ONSEARCH} and /${constants.RET_SELECT} api, ${error.stack}`,
    )
  }

  try {
    logger.info(`Comparing Message Ids of /${constants.RET_ONSEARCH} and /${constants.RET_SELECT}`)
    if (_.isEqual(onSearchContext.message_id, context.message_id)) {
      const key = `${ApiSequence.ON_SEARCH}_msgId`
      errorObj[key] = `Message Id for /${ApiSequence.ON_SEARCH} and /${ApiSequence.SELECT} api cannot be same`
    }

    if (_.isEqual(searchContext.message_id, context.message_id)) {
      const key = `${ApiSequence.SEARCH}_msgId`
      errorObj[key] = `Message Id for /${ApiSequence.SEARCH} and /${ApiSequence.SELECT} api cannot be same`
    }

    setValue('msgId', context.message_id)
  } catch (error: any) {
    logger.info(
      `Error while comparing message ids for /${constants.RET_ONSEARCH} and /${constants.RET_SELECT} api, ${error.stack}`,
    )
  }

  try {
    const customIdArray: any[] = []
    const itemIdArray: any[] = []
    const select = message.order
    const onSearch: any = getValue(`${ApiSequence.ON_SEARCH}`)

    let provider = onSearch?.message?.catalog['bpp/providers'].filter(
      (provider: { id: any }) => provider.id === select.provider.id,
    )

    provider[0].items.map((item: { id: string }) => {
      itemIdArray.push(item.id)
    })
    provider[0].categories.map((item: { id: string }) => {
      customIdArray.push(item.id)
    })

    if (provider[0]) {
      provider = provider[0]
      setValue('providerId', provider.id)
      setValue('providerLoc', provider.locations[0].id)
      setValue('providerGps', provider.locations[0].gps)
      setValue('providerName', provider.descriptor.name)

      try {
        logger.info(`Comparing provider location in /${constants.RET_ONSEARCH} and /${constants.RET_SELECT}`)
        if (provider.locations[0].id != select.provider.locations[0].id) {
          errorObj.prvdLoc = `provider.locations[0].id ${provider.locations[0].id} mismatches in /${constants.RET_ONSEARCH} and /${constants.RET_SELECT}`
        }
      } catch (error: any) {
        logger.error(
          `!!Error while comparing provider's location id in /${constants.RET_ONSEARCH} and /${constants.RET_SELECT}, ${error.stack}`,
        )
      }

      logger.info(
        `Mapping Item Ids with their counts, categories and prices /${constants.RET_ONSEARCH} and /${constants.RET_SELECT}`,
      )

      try {
        const itemMap: any = {}
        const itemMapper: any = {}
        const parentItemIdSet = new Set()
        const itemIdSet = new Set()
        select.items.forEach(
          (
            item: {
              id: string | number
              tags: any[]
              parent_item_id: string | number
              location_id: any
              quantity: { count: number }
            },
            index: number,
          ) => {
            const itemOnSearch = provider.items.find((it: { id: any }) => it.id === item.id)

            const itemTag = tagFinder(item, 'item')

            if (itemTag) {
              if (!itemMap[item.parent_item_id]) {
                itemMap[item.parent_item_id] = {
                  location_id: item.location_id,
                }
              }

              if (!itemIdArray.includes(item.id)) {
                const key = `item${index}item_id`
                errorObj[
                  key
                ] = `/message/order/items/id in item: ${item.id} should be one of the /item/id mapped in on_search`
              }
            }

            const customizationTag = tagFinder(item, 'customization')

            if (customizationTag) {
              const parentTag = item.tags.find((tag) => {
                return (
                  tag.code === 'parent' &&
                  tag.list &&
                  tag.list.find((listItem: { code: string; value: any }) => {
                    return listItem.code === 'id' && customIdArray.includes(listItem.value)
                  })
                )
              })

              if (!parentTag) {
                const key = `item${index}customization_id`
                errorObj[
                  key
                ] = `/message/order/items/tags/customization/value in item: ${item.id} should be one of the customizations id mapped in on_search`
              }
            }

            if (!parentItemIdSet.has(item.parent_item_id)) parentItemIdSet.add(item.parent_item_id)

            if (!itemIdSet.has(item.id)) itemIdSet.add(item.id)

            if (itemMap[item.parent_item_id].location_id !== item.location_id) {
              const key = `item${index}location_id`
              errorObj[key] = `Inconsistent location_id for parent_item_id ${item.parent_item_id}`
            }

            if (itemOnSearch) {
              logger.info(`ITEM ID: ${item.id}, Price: ${itemOnSearch.price.value}, Count: ${item.quantity.count}`)

              itemsIdList[item.id] = item.quantity.count
              itemsCtgrs[item.id] = itemOnSearch.category_id
              itemsTat.push(itemOnSearch['@ondc/org/time_to_ship'])
              selectedPrice += itemOnSearch.price.value * item.quantity.count
            }

            if (!itemMapper[item.id]) {
              // If the item is not in the map, add it
              itemMapper[item.id] = item.parent_item_id
            } else {
              if (itemMapper[item.id] === item.parent_item_id) {
                const key = `item${index}id_parent_item_id`
                errorObj[key] = `/message/order/items/parent_item_id cannot be duplicate if item/id is same`
              }
            }
          },
        )

        try {
          logger.info(`Saving time_to_ship in /${constants.RET_ONSEARCH}`)
          let timeToShip = 0
          itemsTat.forEach((tts: any) => {
            const ttship = isoDurToSec(tts)
            logger.info(ttship)
            timeToShip = Math.max(timeToShip, ttship)
          })
          logger.info('timeTOSHIP', timeToShip)
          setValue('timeToShip', timeToShip)
        } catch (error: any) {
          logger.error(`!!Error while saving time_to_ship in ${constants.RET_ONSEARCH}`, error)
        }

        setValue('itemsIdList', itemsIdList)
        setValue('itemsCtgrs', itemsCtgrs)
        setValue('selectedPrice', selectedPrice)

        logger.info(`Provider Id in /${constants.RET_ONSEARCH} and /${constants.RET_SELECT} matched`)
      } catch (error: any) {
        logger.error(
          `!!Error while Comparing and Mapping Items in /${constants.RET_ONSEARCH} and /${constants.RET_SELECT}, ${error.stack}`,
        )
      }
    } else {
      logger.info(`Provider Ids in /${constants.RET_ONSEARCH} and /${constants.RET_SELECT} mismatch`)
      errorObj.prvdrIdMatch = `Provider Id ${select.provider.id} in /${constants.RET_SELECT} does not exist in /${constants.RET_ONSEARCH}`
    }

    try {
      select.fulfillments.forEach((ff: any) => {
        logger.info(`Checking GPS Precision in /${constants.RET_SELECT}`)

        // eslint-disable-next-line no-prototype-builtins
        if (ff.hasOwnProperty('end')) {
          setValue('buyerGps', ff.end.location.gps)
          setValue('buyerAddr', ff.end.location.address.area_code)
          const gps = ff.end.location.gps.split(',')
          const gpsLat = gps[0]
          const gpsLong = gps[1]
          // logger.info(gpsLat, " sfsfdsf ", gpsLong);
          if (!gpsLat || !gpsLong) {
            errorObj.gpsErr = `fulfillments location.gps is not as per the API contract`
          }

          // eslint-disable-next-line no-prototype-builtins
          if (!ff.end.location.address.hasOwnProperty('area_code')) {
            errorObj.areaCode = `address.area_code is required property in /${constants.RET_SELECT}`
          }
        }
      })
    } catch (error: any) {
      logger.error(`!!Error while checking GPS Precision in /${constants.RET_SELECT}, ${error.stack}`)
    }
  } catch (error: any) {
    logger.error(`!!Error occcurred while checking providers info in /${constants.RET_SELECT},  ${error.message}`)
  }

  return Object.keys(errorObj).length > 0 && errorObj
}
