import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsUUID,
} from 'class-validator';

/**
 * Body for PUT /v1/profiles/me/components/order.
 *
 * Array order = new top-to-bottom display order. Server assigns
 * display_order = index in one transaction.
 *
 * - ArrayUnique catches duplicate IDs at the validation layer (400) before
 *   the service sees them — cheaper than a DB round-trip.
 * - ArrayMaxSize(100) is a safety bound; profiles shouldn't have anywhere
 *   near this many components, and an unbounded array is a DoS vector.
 */
export class ReorderComponentsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  component_ids!: string[];
}
