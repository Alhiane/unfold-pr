<?php
namespace App\Services\Auth;

class AuthenticationService
{
    private TokenManager $tokens;

    public function logOutOtherSessions(User $user): void
    {
        $this->tokens->destroyOtherSessions($user);
    }
}
