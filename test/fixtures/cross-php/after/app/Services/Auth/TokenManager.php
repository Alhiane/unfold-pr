<?php
namespace App\Services\Auth;

class TokenManager
{
    public function destroyOtherSessions(User $user): void
    {
        $user->tokens()->where('id', '!=', $this->current())->delete();
    }

    public static function flushCache(): void
    {
    }

    private function current(): int
    {
        return 0;
    }
}
