import { Location } from '@prisma/client';
import { locationRepository } from './repositories/location.repository';
import { NotFoundError } from '../../utils/errors';

export class LocationsService {
  async findById(id: string): Promise<Location> {
    const location = await locationRepository.findById(id);
    if (!location) {
      throw new NotFoundError(`Location not found: ${id}`);
    }
    return location;
  }

  async findAll(): Promise<Location[]> {
    return locationRepository.findAll();
  }
}

export const locationsService = new LocationsService();
