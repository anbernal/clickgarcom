import { SetMetadata } from '@nestjs/common';

import { TENANT_ROLE_METADATA_KEY } from './roles';

export const Roles = (...roles: readonly string[]) => SetMetadata(TENANT_ROLE_METADATA_KEY, roles);
